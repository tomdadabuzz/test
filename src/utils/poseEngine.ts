import {
  JointKey,
  JointMeta,
  JointTelemetry,
  Landmark3D,
  MotionTake,
  PoseFrame,
  PresetMotionId,
  StudioKinematicsSummary,
} from '@/src/types/mocap';

/** MediaPipe 33-point landmark connection pairs */
export const POSE_CONNECTIONS: Array<[number, number]> = [
  // Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left Arm
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  // Right Arm
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  // Left Leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Right Leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
  // Head / Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
];

export const JOINT_CATALOG: JointMeta[] = [
  { key: 'hips', labelZh: '骨盆中心 (Hips)', bvhName: 'Hips', landmarkIndex: -1 },
  { key: 'spine', labelZh: '腰椎中段 (Spine)', bvhName: 'Spine', landmarkIndex: -1 },
  { key: 'chest', labelZh: '胸廓核心 (Chest)', bvhName: 'Chest', landmarkIndex: -1 },
  { key: 'neck', labelZh: '颈椎节点 (Neck)', bvhName: 'Neck', landmarkIndex: -1 },
  { key: 'head', labelZh: '头部中心 (Head)', bvhName: 'Head', landmarkIndex: 0 },
  { key: 'leftShoulder', labelZh: '左肩关节', bvhName: 'LeftArm', landmarkIndex: 11 },
  { key: 'leftElbow', labelZh: '左肘关节', bvhName: 'LeftForeArm', landmarkIndex: 13 },
  { key: 'leftWrist', labelZh: '左腕关节', bvhName: 'LeftHand', landmarkIndex: 15 },
  { key: 'rightShoulder', labelZh: '右肩关节', bvhName: 'RightArm', landmarkIndex: 12 },
  { key: 'rightElbow', labelZh: '右肘关节', bvhName: 'RightForeArm', landmarkIndex: 14 },
  { key: 'rightWrist', labelZh: '右腕关节', bvhName: 'RightHand', landmarkIndex: 16 },
  { key: 'leftHip', labelZh: '左髋关节', bvhName: 'LeftUpLeg', landmarkIndex: 23 },
  { key: 'leftKnee', labelZh: '左膝关节', bvhName: 'LeftLeg', landmarkIndex: 25 },
  { key: 'leftAnkle', labelZh: '左踝关节', bvhName: 'LeftFoot', landmarkIndex: 27 },
  { key: 'rightHip', labelZh: '右髋关节', bvhName: 'RightUpLeg', landmarkIndex: 24 },
  { key: 'rightKnee', labelZh: '右膝关节', bvhName: 'RightLeg', landmarkIndex: 26 },
  { key: 'rightAnkle', labelZh: '右踝关节', bvhName: 'RightFoot', landmarkIndex: 28 },
];

export const PRESET_MOTION_CATALOG: Array<{
  id: PresetMotionId;
  name: string;
  category: string;
  durationSec: number;
  fps: number;
}> = [
  { id: 'ballet_solo', name: '芭蕾单人阿拉贝斯克', category: '芭蕾单人', durationSec: 3.6, fps: 60 },
  { id: 'ballet_duet', name: '芭蕾双人领舞/跟舞', category: '芭蕾双人', durationSec: 4.0, fps: 60 },
  { id: 'walk', name: '标准步态行走', category: '基础循环', durationSec: 2.0, fps: 60 },
  { id: 'taichi', name: '太极云手起势', category: '武术身法', durationSec: 4.0, fps: 60 },
  { id: 'jumpshot', name: '篮球急停跳投', category: '体育竞技', durationSec: 2.8, fps: 60 },
  { id: 'groove', name: '街舞律动节拍', category: '舞蹈表演', durationSec: 3.2, fps: 60 },
  { id: 'tpose', name: 'T-Pose 静态校准', category: '骨骼标定', durationSec: 1.5, fps: 60 },
];

export function midpoint(a: Landmark3D, b: Landmark3D): Landmark3D {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

export function lerpLandmark(a: Landmark3D, b: Landmark3D, t: number): Landmark3D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    visibility:
      a.visibility !== undefined && b.visibility !== undefined
        ? a.visibility + (b.visibility - a.visibility) * t
        : (b.visibility ?? a.visibility ?? 1),
  };
}

/**
 * Convert MediaPipe worldLandmarks (meters, Y-down) into Three.js studio coordinates (meters, Y-up, floor grounded)
 */
export function normalizeMediaPipeWorldToStudio(
  worldLandmarks: Landmark3D[],
  mirrorX = false,
  scale = 1.0,
  calibratedFloorOffsetY?: number
): Landmark3D[] {
  const converted = worldLandmarks.map((lm) => ({
    x: (mirrorX ? -lm.x : lm.x) * scale,
    y: -lm.y * scale,
    z: -lm.z * scale,
    visibility: lm.visibility ?? 1,
  }));

  if (calibratedFloorOffsetY !== undefined) {
    return converted.map((lm) => ({
      ...lm,
      y: lm.y + calibratedFloorOffsetY,
    }));
  }

  const footIndices = [27, 28, 29, 30, 31, 32];
  let minY = Infinity;
  for (const idx of footIndices) {
    const lm = converted[idx];
    if (lm && lm.y < minY) {
      minY = lm.y;
    }
  }
  if (!Number.isFinite(minY)) minY = -0.9;
  const shiftY = -minY + 0.02;

  return converted.map((lm) => ({
    ...lm,
    y: lm.y + shiftY,
  }));
}

export function smoothLandmarks(
  prev: Landmark3D[] | null,
  next: Landmark3D[],
  smoothingFactor: number
): Landmark3D[] {
  if (!prev || prev.length !== next.length) {
    return next.map((p) => ({ ...p }));
  }
  const alpha = Math.max(0.12, Math.min(1.0, 1.0 - smoothingFactor * 0.88));
  return next.map((lm, i) => lerpLandmark(prev[i], lm, alpha));
}

export function computeJointAngleDeg(a: Landmark3D, b: Landmark3D, c: Landmark3D): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const baz = a.z - b.z;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const bcz = c.z - b.z;

  const lenA = Math.hypot(bax, bay, baz);
  const lenC = Math.hypot(bcx, bcy, bcz);
  if (lenA < 1e-5 || lenC < 1e-5) return 180;

  const dot = (bax * bcx + bay * bcy + baz * bcz) / (lenA * lenC);
  const clamped = Math.max(-1, Math.min(1, dot));
  return (Math.acos(clamped) * 180) / Math.PI;
}

export function getJointPosition(landmarks: Landmark3D[], key: JointKey): Landmark3D {
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  const lSh = landmarks[11];
  const rSh = landmarks[12];
  const hips = midpoint(lHip, rHip);
  const shoulders = midpoint(lSh, rSh);

  switch (key) {
    case 'hips':
      return hips;
    case 'spine':
      return lerpLandmark(hips, shoulders, 0.38);
    case 'chest':
      return lerpLandmark(hips, shoulders, 0.72);
    case 'neck':
      return lerpLandmark(shoulders, landmarks[0], 0.35);
    case 'head':
      return landmarks[0];
    case 'leftShoulder':
      return lSh;
    case 'leftElbow':
      return landmarks[13];
    case 'leftWrist':
      return landmarks[15];
    case 'rightShoulder':
      return rSh;
    case 'rightElbow':
      return landmarks[14];
    case 'rightWrist':
      return landmarks[16];
    case 'leftHip':
      return lHip;
    case 'leftKnee':
      return landmarks[25];
    case 'leftAnkle':
      return landmarks[27];
    case 'rightHip':
      return rHip;
    case 'rightKnee':
      return landmarks[26];
    case 'rightAnkle':
      return landmarks[28];
  }
}

export function computeKinematicsSummary(landmarks: Landmark3D[]): StudioKinematicsSummary {
  const hips = getJointPosition(landmarks, 'hips');
  const shoulders = midpoint(landmarks[11], landmarks[12]);

  const torsoVecY = shoulders.y - hips.y;
  const torsoVecZ = shoulders.z - hips.z;
  const torsoVecX = shoulders.x - hips.x;
  const torsoLen = Math.hypot(torsoVecX, torsoVecY, torsoVecZ) || 1;
  const torsoLeanDeg = (Math.acos(Math.max(-1, Math.min(1, torsoVecY / torsoLen))) * 180) / Math.PI;

  const shoulderDy = landmarks[11].y - landmarks[12].y;
  const shoulderDx = landmarks[11].x - landmarks[12].x || 0.35;
  const shoulderTiltDeg = (Math.atan2(shoulderDy, Math.abs(shoulderDx)) * 180) / Math.PI;

  const leftElbowDeg = computeJointAngleDeg(landmarks[11], landmarks[13], landmarks[15]);
  const rightElbowDeg = computeJointAngleDeg(landmarks[12], landmarks[14], landmarks[16]);
  const leftKneeDeg = computeJointAngleDeg(landmarks[23], landmarks[25], landmarks[27]);
  const rightKneeDeg = computeJointAngleDeg(landmarks[24], landmarks[26], landmarks[28]);

  const avgConfidence =
    landmarks.reduce((acc, l) => acc + (l.visibility ?? 0.96), 0) / Math.max(1, landmarks.length);

  return {
    pelvisHeightM: hips.y,
    torsoLeanDeg,
    leftElbowDeg,
    rightElbowDeg,
    leftKneeDeg,
    rightKneeDeg,
    shoulderTiltDeg,
    avgConfidence,
  };
}

export function computeSelectedJointTelemetry(
  landmarks: Landmark3D[],
  jointKey: JointKey
): JointTelemetry {
  const meta = JOINT_CATALOG.find((j) => j.key === jointKey) ?? JOINT_CATALOG[0];
  const pos = getJointPosition(landmarks, jointKey);

  let targetPos = pos;
  switch (jointKey) {
    case 'hips':
      targetPos = getJointPosition(landmarks, 'spine');
      break;
    case 'spine':
      targetPos = getJointPosition(landmarks, 'chest');
      break;
    case 'chest':
      targetPos = getJointPosition(landmarks, 'neck');
      break;
    case 'neck':
      targetPos = getJointPosition(landmarks, 'head');
      break;
    case 'leftShoulder':
      targetPos = landmarks[13];
      break;
    case 'leftElbow':
      targetPos = landmarks[15];
      break;
    case 'rightShoulder':
      targetPos = landmarks[14];
      break;
    case 'rightElbow':
      targetPos = landmarks[16];
      break;
    case 'leftHip':
      targetPos = landmarks[25];
      break;
    case 'leftKnee':
      targetPos = landmarks[27];
      break;
    case 'rightHip':
      targetPos = landmarks[26];
      break;
    case 'rightKnee':
      targetPos = landmarks[28];
      break;
    default:
      targetPos = { x: pos.x, y: pos.y + 0.1, z: pos.z };
  }

  const dx = targetPos.x - pos.x;
  const dy = targetPos.y - pos.y;
  const dz = targetPos.z - pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const pitch = (Math.asin(Math.max(-1, Math.min(1, dz / len))) * 180) / Math.PI;
  const yaw = (Math.atan2(dx, dy) * 180) / Math.PI;
  const roll = (Math.atan2(dz, dx) * 180) / Math.PI;

  let flexionDeg: number | null = null;
  if (jointKey === 'leftElbow') flexionDeg = computeJointAngleDeg(landmarks[11], landmarks[13], landmarks[15]);
  if (jointKey === 'rightElbow') flexionDeg = computeJointAngleDeg(landmarks[12], landmarks[14], landmarks[16]);
  if (jointKey === 'leftKnee') flexionDeg = computeJointAngleDeg(landmarks[23], landmarks[25], landmarks[27]);
  if (jointKey === 'rightKnee') flexionDeg = computeJointAngleDeg(landmarks[24], landmarks[26], landmarks[28]);

  return {
    joint: meta,
    position: { x: pos.x, y: pos.y, z: pos.z },
    eulerDeg: { x: pitch, y: yaw, z: roll },
    flexionDeg,
    confidence: pos.visibility ?? 0.98,
  };
}

function solveTwoBoneLimb(
  root: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  len1: number,
  len2: number,
  poleDir: { x: number; y: number; z: number }
): { mid: Landmark3D; end: Landmark3D } {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dz = target.z - root.z;
  const rawDist = Math.hypot(dx, dy, dz) || 0.001;
  const maxReach = (len1 + len2) * 0.995;
  const minReach = Math.abs(len1 - len2) + 0.02;
  const dist = Math.max(minReach, Math.min(maxReach, rawDist));

  const dirX = dx / rawDist;
  const dirY = dy / rawDist;
  const dirZ = dz / rawDist;

  const cosA = Math.max(-1, Math.min(1, (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  const dotP = poleDir.x * dirX + poleDir.y * dirY + poleDir.z * dirZ;
  let px = poleDir.x - dotP * dirX;
  let py = poleDir.y - dotP * dirY;
  let pz = poleDir.z - dotP * dirZ;
  const pLen = Math.hypot(px, py, pz) || 1;
  px /= pLen;
  py /= pLen;
  pz /= pLen;

  const mid: Landmark3D = {
    x: root.x + (dirX * cosA + px * sinA) * len1,
    y: root.y + (dirY * cosA + py * sinA) * len1,
    z: root.z + (dirZ * cosA + pz * sinA) * len1,
    visibility: 0.99,
  };

  const end: Landmark3D = {
    x: root.x + dirX * dist,
    y: root.y + dirY * dist,
    z: root.z + dirZ * dist,
    visibility: 0.99,
  };

  return { mid, end };
}

export function buildPoseFromRigParams(params: {
  hipPos: { x: number; y: number; z: number };
  hipYaw: number;
  hipRoll: number;
  torsoPitch: number;
  torsoYaw: number;
  headYaw: number;
  headPitch: number;
  lHandTarget: { x: number; y: number; z: number };
  rHandTarget: { x: number; y: number; z: number };
  lFootTarget: { x: number; y: number; z: number };
  rFootTarget: { x: number; y: number; z: number };
  lElbowPole?: { x: number; y: number; z: number };
  rElbowPole?: { x: number; y: number; z: number };
}): Landmark3D[] {
  const lm: Landmark3D[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.98 }));

  const hipHalfW = 0.115;
  const shHalfW = 0.195;
  const torsoH = 0.50;
  const neckH = 0.18;

  const cosHY = Math.cos(params.hipYaw);
  const sinHY = Math.sin(params.hipYaw);

  const lHip: Landmark3D = {
    x: params.hipPos.x + hipHalfW * cosHY,
    y: params.hipPos.y + hipHalfW * Math.sin(params.hipRoll),
    z: params.hipPos.z - hipHalfW * sinHY,
    visibility: 0.99,
  };
  const rHip: Landmark3D = {
    x: params.hipPos.x - hipHalfW * cosHY,
    y: params.hipPos.y - hipHalfW * Math.sin(params.hipRoll),
    z: params.hipPos.z + hipHalfW * sinHY,
    visibility: 0.99,
  };

  const shCenter = {
    x: params.hipPos.x + Math.sin(params.torsoPitch) * Math.sin(params.torsoYaw) * torsoH,
    y: params.hipPos.y + Math.cos(params.torsoPitch) * torsoH,
    z: params.hipPos.z + Math.sin(params.torsoPitch) * Math.cos(params.torsoYaw) * torsoH,
  };

  const cosSY = Math.cos(params.torsoYaw);
  const sinSY = Math.sin(params.torsoYaw);

  const lSh: Landmark3D = {
    x: shCenter.x + shHalfW * cosSY,
    y: shCenter.y - hipHalfW * 0.4 * Math.sin(params.hipRoll),
    z: shCenter.z - shHalfW * sinSY,
    visibility: 0.99,
  };
  const rSh: Landmark3D = {
    x: shCenter.x - shHalfW * cosSY,
    y: shCenter.y + hipHalfW * 0.4 * Math.sin(params.hipRoll),
    z: shCenter.z + shHalfW * sinSY,
    visibility: 0.99,
  };

  const nose: Landmark3D = {
    x: shCenter.x + Math.sin(params.headYaw) * 0.04,
    y: shCenter.y + neckH,
    z: shCenter.z + 0.08 * Math.cos(params.headPitch),
    visibility: 0.99,
  };

  lm[0] = nose;
  lm[1] = { x: nose.x + 0.025, y: nose.y + 0.03, z: nose.z - 0.02, visibility: 0.96 };
  lm[2] = { x: nose.x + 0.035, y: nose.y + 0.03, z: nose.z - 0.02, visibility: 0.96 };
  lm[3] = { x: nose.x + 0.045, y: nose.y + 0.03, z: nose.z - 0.03, visibility: 0.96 };
  lm[4] = { x: nose.x - 0.025, y: nose.y + 0.03, z: nose.z - 0.02, visibility: 0.96 };
  lm[5] = { x: nose.x - 0.035, y: nose.y + 0.03, z: nose.z - 0.02, visibility: 0.96 };
  lm[6] = { x: nose.x - 0.045, y: nose.y + 0.03, z: nose.z - 0.03, visibility: 0.96 };
  lm[7] = { x: nose.x + 0.075, y: nose.y + 0.01, z: nose.z - 0.08, visibility: 0.95 };
  lm[8] = { x: nose.x - 0.075, y: nose.y + 0.01, z: nose.z - 0.08, visibility: 0.95 };
  lm[9] = { x: nose.x + 0.02, y: nose.y - 0.035, z: nose.z - 0.01, visibility: 0.96 };
  lm[10] = { x: nose.x - 0.02, y: nose.y - 0.035, z: nose.z - 0.01, visibility: 0.96 };

  lm[11] = lSh;
  lm[12] = rSh;
  lm[23] = lHip;
  lm[24] = rHip;

  const lArm = solveTwoBoneLimb(
    lSh,
    params.lHandTarget,
    0.29,
    0.26,
    params.lElbowPole ?? { x: 0.3, y: -0.2, z: -0.9 }
  );
  const rArm = solveTwoBoneLimb(
    rSh,
    params.rHandTarget,
    0.29,
    0.26,
    params.rElbowPole ?? { x: -0.3, y: -0.2, z: -0.9 }
  );

  lm[13] = lArm.mid;
  lm[15] = lArm.end;
  lm[14] = rArm.mid;
  lm[16] = rArm.end;

  const lHandDir = {
    x: (lArm.end.x - lArm.mid.x) * 0.28,
    y: (lArm.end.y - lArm.mid.y) * 0.28,
    z: (lArm.end.z - lArm.mid.z) * 0.28,
  };
  const rHandDir = {
    x: (rArm.end.x - rArm.mid.x) * 0.28,
    y: (rArm.end.y - rArm.mid.y) * 0.28,
    z: (rArm.end.z - rArm.mid.z) * 0.28,
  };
  lm[17] = { x: lArm.end.x + lHandDir.x, y: lArm.end.y + lHandDir.y - 0.02, z: lArm.end.z + lHandDir.z, visibility: 0.93 };
  lm[19] = { x: lArm.end.x + lHandDir.x * 1.1, y: lArm.end.y + lHandDir.y, z: lArm.end.z + lHandDir.z, visibility: 0.93 };
  lm[21] = { x: lArm.end.x + lHandDir.x * 0.6, y: lArm.end.y + lHandDir.y + 0.03, z: lArm.end.z + lHandDir.z, visibility: 0.93 };

  lm[18] = { x: rArm.end.x + rHandDir.x, y: rArm.end.y + rHandDir.y - 0.02, z: rArm.end.z + rHandDir.z, visibility: 0.93 };
  lm[20] = { x: rArm.end.x + rHandDir.x * 1.1, y: rArm.end.y + rHandDir.y, z: rArm.end.z + rHandDir.z, visibility: 0.93 };
  lm[22] = { x: rArm.end.x + rHandDir.x * 0.6, y: rArm.end.y + rHandDir.y + 0.03, z: rArm.end.z + rHandDir.z, visibility: 0.93 };

  const lLeg = solveTwoBoneLimb(lHip, params.lFootTarget, 0.43, 0.42, { x: 0.05, y: 0.1, z: 1.0 });
  const rLeg = solveTwoBoneLimb(rHip, params.rFootTarget, 0.43, 0.42, { x: -0.05, y: 0.1, z: 1.0 });

  lm[25] = lLeg.mid;
  lm[27] = lLeg.end;
  lm[26] = rLeg.mid;
  lm[28] = rLeg.end;

  lm[29] = { x: lLeg.end.x, y: Math.max(0.02, lLeg.end.y - 0.04), z: lLeg.end.z - 0.05, visibility: 0.97 };
  lm[31] = { x: lLeg.end.x, y: Math.max(0.015, lLeg.end.y - 0.05), z: lLeg.end.z + 0.13, visibility: 0.97 };

  lm[30] = { x: rLeg.end.x, y: Math.max(0.02, rLeg.end.y - 0.04), z: rLeg.end.z - 0.05, visibility: 0.97 };
  lm[32] = { x: rLeg.end.x, y: Math.max(0.015, rLeg.end.y - 0.05), z: rLeg.end.z + 0.13, visibility: 0.97 };

  return lm;
}

export function generatePresetMotionTake(presetId: PresetMotionId): MotionTake {
  const meta = PRESET_MOTION_CATALOG.find((p) => p.id === presetId) ?? PRESET_MOTION_CATALOG[0];
  const totalFrames = Math.round(meta.durationSec * meta.fps);
  const frames: PoseFrame[] = [];
  const followerFrames: PoseFrame[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const u = i / totalFrames;
    const phase = u * Math.PI * 2;
    let landmarks: Landmark3D[];

    if (presetId === 'ballet_solo') {
      // Ballet Port de Bras + Arabesque extension
      const ext = Math.sin(u * Math.PI); // 0 -> 1 -> 0 smooth extension
      const plie = Math.sin(phase * 2) * 0.03;
      landmarks = buildPoseFromRigParams({
        hipPos: { x: 0, y: 0.91 + ext * 0.05 + plie, z: ext * 0.06 },
        hipYaw: 0.15 * ext,
        hipRoll: -0.06 * ext,
        torsoPitch: 0.24 * ext,
        torsoYaw: 0.12 * ext,
        headYaw: -0.18 * ext,
        headPitch: -0.1 * ext,
        lHandTarget: { x: 0.28 + ext * 0.24, y: 1.38 + ext * 0.24, z: 0.34 + ext * 0.18 },
        rHandTarget: { x: -0.45 - ext * 0.15, y: 1.34 + ext * 0.08, z: -0.15 * ext },
        lFootTarget: { x: 0.04, y: 0.08 + ext * 0.03, z: 0.0 },
        rFootTarget: { x: -0.14, y: 0.08 + ext * 0.72, z: -0.18 - ext * 0.56 },
        lElbowPole: { x: 0.3, y: 0.1, z: -0.7 },
        rElbowPole: { x: -0.3, y: 0.1, z: -0.7 },
      });
    } else if (presetId === 'ballet_duet') {
      // Leader (领舞) orbiting & supporting
      const orbit = Math.sin(phase) * 0.22;
      const leaderLm = buildPoseFromRigParams({
        hipPos: { x: -0.38 + orbit * 0.3, y: 0.89 + Math.sin(phase * 2) * 0.025, z: -0.12 },
        hipYaw: -0.55 + Math.sin(phase) * 0.2,
        hipRoll: 0.02,
        torsoPitch: 0.05,
        torsoYaw: -0.62 + Math.sin(phase) * 0.18,
        headYaw: -0.45,
        headPitch: 0.02,
        lHandTarget: { x: -0.04, y: 1.24 + Math.sin(phase) * 0.08, z: 0.12 },
        rHandTarget: { x: -0.18, y: 1.05 + Math.cos(phase) * 0.06, z: -0.06 },
        lFootTarget: { x: -0.26, y: 0.07 + Math.max(0, Math.sin(phase)) * 0.05, z: -0.04 },
        rFootTarget: { x: -0.48, y: 0.07, z: -0.22 },
      });
      // Follower (跟舞) mirroring gracefully & rising on relevé
      const rise = Math.max(0, Math.sin(phase)) * 0.07;
      const followerLm = buildPoseFromRigParams({
        hipPos: { x: 0.32 - orbit * 0.2, y: 0.90 + rise, z: 0.10 },
        hipYaw: 2.55 - Math.sin(phase) * 0.2,
        hipRoll: -0.04,
        torsoPitch: 0.09,
        torsoYaw: 2.55 - Math.sin(phase) * 0.18,
        headYaw: 2.4,
        headPitch: -0.06,
        lHandTarget: { x: 0.02, y: 1.24 + Math.sin(phase) * 0.08, z: 0.14 },
        rHandTarget: { x: 0.56, y: 1.48 + rise * 1.4, z: 0.24 },
        lFootTarget: { x: 0.22, y: 0.08 + rise, z: 0.08 },
        rFootTarget: { x: 0.44, y: 0.08 + Math.max(0, -Math.sin(phase)) * 0.18, z: 0.26 },
      });

      landmarks = leaderLm;
      followerFrames.push({
        timestampMs: Math.round((i / meta.fps) * 1000),
        landmarks: followerLm,
      });
    } else if (presetId === 'tpose') {
      const breath = Math.sin(phase) * 0.006;
      landmarks = buildPoseFromRigParams({
        hipPos: { x: 0, y: 0.91 + breath * 0.3, z: 0 },
        hipYaw: 0,
        hipRoll: 0,
        torsoPitch: 0,
        torsoYaw: 0,
        headYaw: 0,
        headPitch: 0,
        lHandTarget: { x: 0.72, y: 1.41 + breath, z: 0 },
        rHandTarget: { x: -0.72, y: 1.41 + breath, z: 0 },
        lFootTarget: { x: 0.125, y: 0.07, z: 0 },
        rFootTarget: { x: -0.125, y: 0.07, z: 0 },
        lElbowPole: { x: 0, y: 0, z: -1 },
        rElbowPole: { x: 0, y: 0, z: -1 },
      });
    } else if (presetId === 'walk') {
      const stride = 0.32;
      const lLift = Math.max(0, Math.sin(phase)) * 0.11;
      const rLift = Math.max(0, Math.sin(phase + Math.PI)) * 0.11;
      const lFootZ = Math.sin(phase) * stride;
      const rFootZ = Math.sin(phase + Math.PI) * stride;
      const bob = Math.abs(Math.sin(phase)) * 0.035;

      landmarks = buildPoseFromRigParams({
        hipPos: { x: Math.sin(phase) * 0.025, y: 0.87 + bob, z: 0 },
        hipYaw: Math.sin(phase) * 0.14,
        hipRoll: Math.cos(phase) * 0.05,
        torsoPitch: 0.07,
        torsoYaw: -Math.sin(phase) * 0.16,
        headYaw: Math.sin(phase) * 0.04,
        headPitch: 0.02,
        lHandTarget: {
          x: 0.25,
          y: 0.88 + Math.max(0, -Math.sin(phase)) * 0.06,
          z: -Math.sin(phase) * 0.27,
        },
        rHandTarget: {
          x: -0.25,
          y: 0.88 + Math.max(0, Math.sin(phase)) * 0.06,
          z: Math.sin(phase) * 0.27,
        },
        lFootTarget: { x: 0.12, y: 0.07 + lLift, z: lFootZ },
        rFootTarget: { x: -0.12, y: 0.07 + rLift, z: rFootZ },
      });
    } else if (presetId === 'taichi') {
      const swayX = Math.sin(phase) * 0.16;
      const sink = Math.cos(phase * 2) * 0.03;
      landmarks = buildPoseFromRigParams({
        hipPos: { x: swayX, y: 0.79 + sink, z: 0 },
        hipYaw: Math.sin(phase) * 0.26,
        hipRoll: Math.sin(phase) * 0.04,
        torsoPitch: 0.06,
        torsoYaw: Math.sin(phase) * 0.34,
        headYaw: Math.sin(phase) * 0.22,
        headPitch: 0,
        lHandTarget: {
          x: swayX + 0.18 + Math.cos(phase) * 0.24,
          y: 1.24 + Math.sin(phase) * 0.16,
          z: 0.34 + Math.sin(phase) * 0.08,
        },
        rHandTarget: {
          x: swayX - 0.18 + Math.cos(phase) * 0.24,
          y: 1.12 - Math.sin(phase) * 0.16,
          z: 0.32 - Math.sin(phase) * 0.08,
        },
        lFootTarget: { x: 0.24, y: 0.07, z: 0.05 },
        rFootTarget: { x: -0.24, y: 0.07, z: -0.05 },
        lElbowPole: { x: 0.5, y: -0.4, z: -0.3 },
        rElbowPole: { x: -0.5, y: -0.4, z: -0.3 },
      });
    } else if (presetId === 'jumpshot') {
      let crouch = 0;
      let jumpY = 0;
      let armRaise = 0;
      if (u < 0.35) {
        const k = Math.sin((u / 0.35) * (Math.PI / 2));
        crouch = k * 0.22;
        armRaise = k * 0.25;
      } else if (u < 0.72) {
        const k = (u - 0.35) / 0.37;
        const arc = Math.sin(k * Math.PI);
        crouch = Math.max(0, (1 - k * 3) * 0.22);
        jumpY = arc * 0.42;
        armRaise = 0.25 + Math.min(1, k * 1.4) * 0.75;
      } else {
        const k = (u - 0.72) / 0.28;
        crouch = Math.sin(k * Math.PI) * 0.16;
        armRaise = (1 - k) * 0.9;
      }

      landmarks = buildPoseFromRigParams({
        hipPos: { x: 0, y: 0.89 - crouch + jumpY, z: 0 },
        hipYaw: 0.12,
        hipRoll: 0,
        torsoPitch: crouch * 0.65 - jumpY * 0.15,
        torsoYaw: 0.15,
        headYaw: 0.05,
        headPitch: -armRaise * 0.25,
        lHandTarget: {
          x: 0.08,
          y: 1.08 - crouch * 0.8 + jumpY + armRaise * 0.72,
          z: 0.26 + armRaise * 0.08,
        },
        rHandTarget: {
          x: -0.10,
          y: 1.10 - crouch * 0.8 + jumpY + armRaise * 0.78,
          z: 0.24 + armRaise * 0.12,
        },
        lFootTarget: { x: 0.14, y: 0.07 + jumpY * 0.85, z: 0.06 },
        rFootTarget: { x: -0.14, y: 0.07 + jumpY * 0.92, z: -0.04 },
      });
    } else {
      const beat = Math.sin(phase * 2);
      const bounce = Math.abs(Math.sin(phase * 2)) * 0.09;
      landmarks = buildPoseFromRigParams({
        hipPos: { x: Math.sin(phase) * 0.12, y: 0.82 + bounce, z: 0 },
        hipYaw: Math.sin(phase) * 0.32,
        hipRoll: Math.cos(phase * 2) * 0.09,
        torsoPitch: 0.08 + beat * 0.05,
        torsoYaw: -Math.sin(phase) * 0.28,
        headYaw: Math.sin(phase) * 0.18,
        headPitch: beat * 0.08,
        lHandTarget: {
          x: 0.34 + Math.cos(phase * 2) * 0.14,
          y: 1.24 + Math.sin(phase * 2) * 0.18,
          z: 0.25 + Math.sin(phase) * 0.14,
        },
        rHandTarget: {
          x: -0.34 + Math.cos(phase * 2) * 0.14,
          y: 1.18 - Math.sin(phase * 2) * 0.18,
          z: 0.22 - Math.sin(phase) * 0.14,
        },
        lFootTarget: { x: 0.20, y: 0.07 + Math.max(0, Math.sin(phase)) * 0.08, z: 0.08 * Math.cos(phase) },
        rFootTarget: { x: -0.20, y: 0.07 + Math.max(0, -Math.sin(phase)) * 0.08, z: -0.08 * Math.cos(phase) },
      });
    }

    frames.push({
      timestampMs: Math.round((i / meta.fps) * 1000),
      landmarks,
    });
  }

  return {
    id: `preset_${presetId}`,
    name: meta.name,
    createdAt: Date.now(),
    fps: meta.fps,
    durationMs: meta.durationSec * 1000,
    source: 'preset',
    frames,
    followerFrames: followerFrames.length > 0 ? followerFrames : undefined,
    datasetMeta: {
      sequenceId: presetId === 'ballet_duet' ? 'BALLET_DUET_001' : `SEQ_${presetId.toUpperCase()}_001`,
      dancerId: 'DANCER_A01',
      followerDancerId: presetId === 'ballet_duet' ? 'DANCER_B02' : '',
      danceStyle: presetId.startsWith('ballet') ? '芭蕾 (Ballet)' : meta.category,
      clipName: meta.name,
      musicId: presetId.startsWith('ballet') ? 'MUS_WALTZ_001' : 'MUS_REF_001',
      musicStartSec: 0,
      sourceLicense: 'Kinetix 实验室合成基准',
    },
  };
}
