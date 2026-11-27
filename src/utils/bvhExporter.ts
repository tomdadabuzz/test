import * as THREE from 'three';
import { Landmark3D, MotionTake, PoseFrame } from '@/src/types/mocap';
import { lerpLandmark, midpoint, POSE_CONNECTIONS } from '@/src/utils/poseEngine';

/**
 * Industry-standard BVH (Biovision Hierarchy) exporter & parser.
 * Converts 33 MediaPipe studio Y-up landmarks (meters) into a 17-joint humanoid skeleton
 * in centimeters (1m = 100cm) with ZXY Euler channels compatible with Blender / Maya / Unity / Unreal.
 */

interface BvhBoneNode {
  name: string;
  offset: [number, number, number]; // in cm
  children: BvhBoneNode[];
  endSiteOffset?: [number, number, number];
}

const CM_SCALE = 100;

function vFromLm(lm: Landmark3D): THREE.Vector3 {
  return new THREE.Vector3(lm.x, lm.y, lm.z);
}

function getSkeletonPoints(lm: Landmark3D[]) {
  const lHip = vFromLm(lm[23]);
  const rHip = vFromLm(lm[24]);
  const lSh = vFromLm(lm[11]);
  const rSh = vFromLm(lm[12]);
  const hips = lHip.clone().add(rHip).multiplyScalar(0.5);
  const shoulders = lSh.clone().add(rSh).multiplyScalar(0.5);

  const spine = hips.clone().lerp(shoulders, 0.38);
  const chest = hips.clone().lerp(shoulders, 0.72);
  const head = vFromLm(lm[0]);
  const neck = shoulders.clone().lerp(head, 0.35);

  return {
    Hips: hips,
    Spine: spine,
    Chest: chest,
    Neck: neck,
    Head: head,
    LeftArm: lSh,
    LeftForeArm: vFromLm(lm[13]),
    LeftHand: vFromLm(lm[15]),
    RightArm: rSh,
    RightForeArm: vFromLm(lm[14]),
    RightHand: vFromLm(lm[16]),
    LeftUpLeg: lHip,
    LeftLeg: vFromLm(lm[25]),
    LeftFoot: vFromLm(lm[27]),
    RightUpLeg: rHip,
    RightLeg: vFromLm(lm[26]),
    RightFoot: vFromLm(lm[28]),
  };
}

const BVH_PARENT_MAP: Record<string, string | null> = {
  Hips: null,
  Spine: 'Hips',
  Chest: 'Spine',
  Neck: 'Chest',
  Head: 'Neck',
  LeftArm: 'Chest',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  RightArm: 'Chest',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
};

const BVH_CHILD_TARGET: Record<string, string | null> = {
  Hips: 'Spine',
  Spine: 'Chest',
  Chest: 'Neck',
  Neck: 'Head',
  Head: null,
  LeftArm: 'LeftForeArm',
  LeftForeArm: 'LeftHand',
  LeftHand: null,
  RightArm: 'RightForeArm',
  RightForeArm: 'RightHand',
  RightHand: null,
  LeftUpLeg: 'LeftLeg',
  LeftLeg: 'LeftFoot',
  LeftFoot: null,
  RightUpLeg: 'RightLeg',
  RightLeg: 'RightFoot',
  RightFoot: null,
};

// Canonical T-pose rest vectors (normalized) for each bone segment
const REST_DIR: Record<string, THREE.Vector3> = {
  Hips: new THREE.Vector3(0, 1, 0),
  Spine: new THREE.Vector3(0, 1, 0),
  Chest: new THREE.Vector3(0, 1, 0),
  Neck: new THREE.Vector3(0, 1, 0),
  Head: new THREE.Vector3(0, 1, 0),
  LeftArm: new THREE.Vector3(1, 0, 0),
  LeftForeArm: new THREE.Vector3(1, 0, 0),
  LeftHand: new THREE.Vector3(1, 0, 0),
  RightArm: new THREE.Vector3(-1, 0, 0),
  RightForeArm: new THREE.Vector3(-1, 0, 0),
  RightHand: new THREE.Vector3(-1, 0, 0),
  LeftUpLeg: new THREE.Vector3(0, -1, 0),
  LeftLeg: new THREE.Vector3(0, -1, 0),
  LeftFoot: new THREE.Vector3(0, 0, 1),
  RightUpLeg: new THREE.Vector3(0, -1, 0),
  RightLeg: new THREE.Vector3(0, -1, 0),
  RightFoot: new THREE.Vector3(0, 0, 1),
};

const JOINT_ORDER = [
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const;

function buildHierarchyTree(refFrame: PoseFrame): BvhBoneNode {
  const pts = getSkeletonPoints(refFrame.landmarks);

  const avgLen = (a: THREE.Vector3, b: THREE.Vector3) =>
    Math.max(5, Math.round(a.distanceTo(b) * CM_SCALE * 100) / 100);

  const spineLen = avgLen(pts.Hips, pts.Spine);
  const chestLen = avgLen(pts.Spine, pts.Chest);
  const neckLen = avgLen(pts.Chest, pts.Neck);
  const headLen = avgLen(pts.Neck, pts.Head);
  const shoulderHalf = Math.max(12, Math.round((pts.LeftArm.distanceTo(pts.RightArm) * 0.5) * CM_SCALE * 100) / 100);
  const upperArmLen = avgLen(pts.LeftArm, pts.LeftForeArm);
  const foreArmLen = avgLen(pts.LeftForeArm, pts.LeftHand);
  const hipHalf = Math.max(9, Math.round((pts.LeftUpLeg.distanceTo(pts.RightUpLeg) * 0.5) * CM_SCALE * 100) / 100);
  const thighLen = avgLen(pts.LeftUpLeg, pts.LeftLeg);
  const shinLen = avgLen(pts.LeftLeg, pts.LeftFoot);

  return {
    name: 'Hips',
    offset: [0, 0, 0],
    children: [
      {
        name: 'Spine',
        offset: [0, spineLen, 0],
        children: [
          {
            name: 'Chest',
            offset: [0, chestLen, 0],
            children: [
              {
                name: 'Neck',
                offset: [0, neckLen, 0],
                children: [
                  {
                    name: 'Head',
                    offset: [0, headLen, 0],
                    children: [],
                    endSiteOffset: [0, 15, 0],
                  },
                ],
              },
              {
                name: 'LeftArm',
                offset: [shoulderHalf, neckLen * 0.65, 0],
                children: [
                  {
                    name: 'LeftForeArm',
                    offset: [upperArmLen, 0, 0],
                    children: [
                      {
                        name: 'LeftHand',
                        offset: [foreArmLen, 0, 0],
                        children: [],
                        endSiteOffset: [14, 0, 0],
                      },
                    ],
                  },
                ],
              },
              {
                name: 'RightArm',
                offset: [-shoulderHalf, neckLen * 0.65, 0],
                children: [
                  {
                    name: 'RightForeArm',
                    offset: [-upperArmLen, 0, 0],
                    children: [
                      {
                        name: 'RightHand',
                        offset: [-foreArmLen, 0, 0],
                        children: [],
                        endSiteOffset: [-14, 0, 0],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'LeftUpLeg',
        offset: [hipHalf, -3, 0],
        children: [
          {
            name: 'LeftLeg',
            offset: [0, -thighLen, 0],
            children: [
              {
                name: 'LeftFoot',
                offset: [0, -shinLen, 0],
                children: [],
                endSiteOffset: [0, -5, 14],
              },
            ],
          },
        ],
      },
      {
        name: 'RightUpLeg',
        offset: [-hipHalf, -3, 0],
        children: [
          {
            name: 'RightLeg',
            offset: [0, -thighLen, 0],
            children: [
              {
                name: 'RightFoot',
                offset: [0, -shinLen, 0],
                children: [],
                endSiteOffset: [0, -5, 14],
              },
            ],
          },
        ],
      },
    ],
  };
}

function serializeHierarchy(node: BvhBoneNode, depth: number, isRoot: boolean): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  lines.push(`${indent}${isRoot ? 'ROOT' : 'JOINT'} ${node.name}`);
  lines.push(`${indent}{`);
  lines.push(`${indent}  OFFSET ${node.offset[0].toFixed(3)} ${node.offset[1].toFixed(3)} ${node.offset[2].toFixed(3)}`);
  if (isRoot) {
    lines.push(`${indent}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation`);
  } else {
    lines.push(`${indent}  CHANNELS 3 Zrotation Xrotation Yrotation`);
  }

  for (const child of node.children) {
    lines.push(...serializeHierarchy(child, depth + 1, false));
  }

  if (node.children.length === 0 && node.endSiteOffset) {
    lines.push(`${indent}  End Site`);
    lines.push(`${indent}  {`);
    lines.push(
      `${indent}    OFFSET ${node.endSiteOffset[0].toFixed(3)} ${node.endSiteOffset[1].toFixed(3)} ${node.endSiteOffset[2].toFixed(3)}`
    );
    lines.push(`${indent}  }`);
  }

  lines.push(`${indent}}`);
  return lines;
}

function collectNodeOrder(node: BvhBoneNode, out: string[]) {
  out.push(node.name);
  for (const child of node.children) {
    collectNodeOrder(child, out);
  }
}

export function exportTakeToBvh(take: MotionTake): string {
  if (take.frames.length === 0) {
    throw new Error('没有可导出的动作帧数据');
  }

  const refFrame = take.frames[0];
  const rootNode = buildHierarchyTree(refFrame);
  const order: string[] = [];
  collectNodeOrder(rootNode, order);

  const lines: string[] = ['HIERARCHY', ...serializeHierarchy(rootNode, 0, true)];
  const frameTime = 1 / Math.max(1, take.fps);
  lines.push('MOTION');
  lines.push(`Frames: ${take.frames.length}`);
  lines.push(`Frame Time: ${frameTime.toFixed(6)}`);

  const _euler = new THREE.Euler(0, 0, 0, 'ZXY');
  const _localQuat = new THREE.Quaternion();
  const _invParentQuat = new THREE.Quaternion();
  const _targetDir = new THREE.Vector3();
  const _worldQuatMap: Record<string, THREE.Quaternion> = {};

  for (const frame of take.frames) {
    const pts = getSkeletonPoints(frame.landmarks) as Record<string, THREE.Vector3>;
    const rowValues: string[] = [];

    // Root world translation (cm)
    const hipPos = pts.Hips;
    rowValues.push(
      (hipPos.x * CM_SCALE).toFixed(3),
      (hipPos.y * CM_SCALE).toFixed(3),
      (hipPos.z * CM_SCALE).toFixed(3)
    );

    // Compute world quaternions first
    for (const jointName of JOINT_ORDER) {
      const worldQ = new THREE.Quaternion();
      if (jointName === 'Hips') {
        // Derive pelvis basis: X from RightHip->LeftHip, Y from Hips->Spine
        const xAxis = pts.LeftUpLeg.clone().sub(pts.RightUpLeg).normalize();
        const yAxis = pts.Spine.clone().sub(pts.Hips).normalize();
        const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
        const orthoY = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
        const basis = new THREE.Matrix4().makeBasis(xAxis, orthoY, zAxis);
        worldQ.setFromRotationMatrix(basis);
      } else {
        const childName = BVH_CHILD_TARGET[jointName];
        if (childName && pts[childName]) {
          _targetDir.copy(pts[childName]).sub(pts[jointName]).normalize();
          worldQ.setFromUnitVectors(REST_DIR[jointName], _targetDir);
        } else {
          const parentName = BVH_PARENT_MAP[jointName];
          if (parentName && _worldQuatMap[parentName]) {
            worldQ.copy(_worldQuatMap[parentName]);
          }
        }
      }
      _worldQuatMap[jointName] = worldQ;
    }

    // Emit local ZXY Euler channels in hierarchy traversal order
    for (const jointName of order) {
      const parentName = BVH_PARENT_MAP[jointName];
      const worldQ = _worldQuatMap[jointName] ?? new THREE.Quaternion();
      if (parentName && _worldQuatMap[parentName]) {
        _invParentQuat.copy(_worldQuatMap[parentName]).invert();
        _localQuat.copy(_invParentQuat).multiply(worldQ);
      } else {
        _localQuat.copy(worldQ);
      }
      _euler.setFromQuaternion(_localQuat, 'ZXY');
      const zDeg = THREE.MathUtils.radToDeg(_euler.z);
      const xDeg = THREE.MathUtils.radToDeg(_euler.x);
      const yDeg = THREE.MathUtils.radToDeg(_euler.y);
      rowValues.push(zDeg.toFixed(3), xDeg.toFixed(3), yDeg.toFixed(3));
    }

    lines.push(rowValues.join(' '));
  }

  return lines.join('\n');
}

export function exportTakeToJson(take: MotionTake): string {
  return JSON.stringify(
    {
      format: 'kinetix-mocap-v1',
      name: take.name,
      fps: take.fps,
      frameCount: take.frames.length,
      durationMs: take.durationMs,
      exportedAt: new Date().toISOString(),
      frames: take.frames.map((f, index) => ({
        frame: index,
        timestampMs: f.timestampMs,
        landmarks3D: f.landmarks,
      })),
    },
    null,
    2
  );
}

export function exportTakeToCsv(take: MotionTake): string {
  const header = ['frame', 'timestamp_ms'];
  for (let i = 0; i < 33; i++) {
    header.push(`lm${i}_x`, `lm${i}_y`, `lm${i}_z`);
  }
  const rows = [header.join(',')];
  take.frames.forEach((f, idx) => {
    const cols = [String(idx), String(f.timestampMs)];
    for (let i = 0; i < 33; i++) {
      const lm = f.landmarks[i] ?? { x: 0, y: 0, z: 0 };
      cols.push(lm.x.toFixed(5), lm.y.toFixed(5), lm.z.toFixed(5));
    }
    rows.push(cols.join(','));
  });
  return rows.join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parse an imported JSON or BVH file back into a playable MotionTake.
 */
export function parseImportedMotionFile(filename: string, rawText: string): MotionTake {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(rawText);
    const framesRaw = Array.isArray(parsed.frames) ? parsed.frames : [];
    const frames: PoseFrame[] = framesRaw
      .filter((f: any) => Array.isArray(f.landmarks3D) && f.landmarks3D.length >= 29)
      .map((f: any, idx: number) => ({
        timestampMs: typeof f.timestampMs === 'number' ? f.timestampMs : Math.round((idx / (parsed.fps || 30)) * 1000),
        landmarks: f.landmarks3D.slice(0, 33).map((lm: any) => ({
          x: Number(lm.x) || 0,
          y: Number(lm.y) || 0,
          z: Number(lm.z) || 0,
          visibility: typeof lm.visibility === 'number' ? lm.visibility : 0.98,
        })),
      }));

    if (frames.length === 0) {
      throw new Error('JSON 文件中未找到有效的 33 点骨骼帧数据');
    }

    const fps = Number(parsed.fps) || 30;
    return {
      id: `imported_${Date.now()}`,
      name: parsed.name || filename.replace(/\.json$/i, ''),
      createdAt: Date.now(),
      fps,
      durationMs: Math.round((frames.length / fps) * 1000),
      source: 'imported',
      frames,
    };
  }

  if (lower.endsWith('.bvh')) {
    return parseBvhToMotionTake(filename, rawText);
  }

  throw new Error('仅支持导入 .bvh 或 .json 格式的动作捕捉文件');
}

interface ParsedBvhJoint {
  name: string;
  offset: THREE.Vector3;
  channels: string[];
  children: ParsedBvhJoint[];
  endSite?: THREE.Vector3;
}

function parseBvhToMotionTake(filename: string, text: string): MotionTake {
  const tokens = text
    .replace(/\r/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  let idx = 0;
  const expect = (val: string) => {
    if (tokens[idx] !== val) {
      throw new Error(`BVH 语法解析失败，预期 "${val}"，实际 "${tokens[idx]}"`);
    }
    idx++;
  };

  function parseJoint(isRoot: boolean): ParsedBvhJoint {
    idx++; // skip ROOT / JOINT
    const name = tokens[idx++];
    expect('{');
    const joint: ParsedBvhJoint = {
      name,
      offset: new THREE.Vector3(),
      channels: [],
      children: [],
    };
    while (idx < tokens.length && tokens[idx] !== '}') {
      const kw = tokens[idx];
      if (kw === 'OFFSET') {
        idx++;
        joint.offset.set(
          parseFloat(tokens[idx++]) / CM_SCALE,
          parseFloat(tokens[idx++]) / CM_SCALE,
          parseFloat(tokens[idx++]) / CM_SCALE
        );
      } else if (kw === 'CHANNELS') {
        idx++;
        const count = parseInt(tokens[idx++], 10);
        for (let c = 0; c < count; c++) {
          joint.channels.push(tokens[idx++]);
        }
      } else if (kw === 'JOINT') {
        joint.children.push(parseJoint(false));
      } else if (kw === 'End') {
        idx += 2; // End Site
        expect('{');
        expect('OFFSET');
        joint.endSite = new THREE.Vector3(
          parseFloat(tokens[idx++]) / CM_SCALE,
          parseFloat(tokens[idx++]) / CM_SCALE,
          parseFloat(tokens[idx++]) / CM_SCALE
        );
        expect('}');
      } else {
        idx++;
      }
    }
    expect('}');
    return joint;
  }

  if (tokens[idx++] !== 'HIERARCHY') {
    throw new Error('无效的 BVH 文件：缺少 HIERARCHY 段');
  }
  const root = parseJoint(true);

  if (tokens[idx++] !== 'MOTION') {
    throw new Error('无效的 BVH 文件：缺少 MOTION 段');
  }
  idx++; // Frames:
  const frameCount = parseInt(tokens[idx++], 10);
  idx += 2; // Frame Time:
  const frameTime = parseFloat(tokens[idx++]) || 1 / 30;
  const fps = Math.max(10, Math.min(120, Math.round(1 / frameTime)));

  const frames: PoseFrame[] = [];

  for (let f = 0; f < frameCount; f++) {
    const worldPositions: Record<string, THREE.Vector3> = {};

    const evalJoint = (j: ParsedBvhJoint, parentPos: THREE.Vector3, parentQuat: THREE.Quaternion) => {
      let tx = 0;
      let ty = 0;
      let tz = 0;
      let rx = 0;
      let ry = 0;
      let rz = 0;

      for (const ch of j.channels) {
        const val = parseFloat(tokens[idx++] || '0');
        if (ch === 'Xposition') tx = val / CM_SCALE;
        else if (ch === 'Yposition') ty = val / CM_SCALE;
        else if (ch === 'Zposition') tz = val / CM_SCALE;
        else if (ch === 'Xrotation') rx = THREE.MathUtils.degToRad(val);
        else if (ch === 'Yrotation') ry = THREE.MathUtils.degToRad(val);
        else if (ch === 'Zrotation') rz = THREE.MathUtils.degToRad(val);
      }

      const localPos = j.offset.clone().add(new THREE.Vector3(tx, ty, tz));
      const worldPos = localPos.applyQuaternion(parentQuat).add(parentPos);

      // Reconstruct ZXY rotation order
      const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'ZXY'));
      const worldQuat = parentQuat.clone().multiply(localQuat);

      worldPositions[j.name] = worldPos;
      for (const child of j.children) {
        evalJoint(child, worldPos, worldQuat);
      }
    };

    evalJoint(root, new THREE.Vector3(0, 0, 0), new THREE.Quaternion());

    // Map BVH joint names back to 33 MediaPipe landmarks
    const pick = (names: string[], fallback: THREE.Vector3) => {
      for (const n of names) {
        const match = Object.keys(worldPositions).find((k) => k.toLowerCase() === n.toLowerCase());
        if (match) return worldPositions[match];
      }
      return fallback;
    };

    const hips = pick(['Hips', 'Root', 'pelvis'], new THREE.Vector3(0, 0.9, 0));
    const head = pick(['Head', 'head'], hips.clone().add(new THREE.Vector3(0, 0.72, 0)));
    const lSh = pick(['LeftArm', 'LeftShoulder', 'lShldr'], hips.clone().add(new THREE.Vector3(0.2, 0.5, 0)));
    const rSh = pick(['RightArm', 'RightShoulder', 'rShldr'], hips.clone().add(new THREE.Vector3(-0.2, 0.5, 0)));
    const lEl = pick(['LeftForeArm', 'LeftElbow', 'lForeArm'], lSh.clone().add(new THREE.Vector3(0.28, 0, 0)));
    const rEl = pick(['RightForeArm', 'RightElbow', 'rForeArm'], rSh.clone().add(new THREE.Vector3(-0.28, 0, 0)));
    const lWr = pick(['LeftHand', 'LeftWrist', 'lHand'], lEl.clone().add(new THREE.Vector3(0.25, 0, 0)));
    const rWr = pick(['RightHand', 'RightWrist', 'rHand'], rEl.clone().add(new THREE.Vector3(-0.25, 0, 0)));
    const lHip = pick(['LeftUpLeg', 'LeftHip', 'lThigh'], hips.clone().add(new THREE.Vector3(0.11, -0.04, 0)));
    const rHip = pick(['RightUpLeg', 'RightHip', 'rThigh'], hips.clone().add(new THREE.Vector3(-0.11, -0.04, 0)));
    const lKn = pick(['LeftLeg', 'LeftKnee', 'lShin'], lHip.clone().add(new THREE.Vector3(0, -0.43, 0)));
    const rKn = pick(['RightLeg', 'RightKnee', 'rShin'], rHip.clone().add(new THREE.Vector3(0, -0.43, 0)));
    const lAn = pick(['LeftFoot', 'LeftAnkle', 'lFoot'], lKn.clone().add(new THREE.Vector3(0, -0.42, 0)));
    const rAn = pick(['RightFoot', 'RightAnkle', 'rFoot'], rKn.clone().add(new THREE.Vector3(0, -0.42, 0)));

    const toLm = (v: THREE.Vector3): Landmark3D => ({ x: v.x, y: v.y, z: v.z, visibility: 0.98 });
    const lm: Landmark3D[] = Array.from({ length: 33 }, () => toLm(hips));
    lm[0] = toLm(head);
    lm[7] = { x: head.x + 0.07, y: head.y, z: head.z - 0.05, visibility: 0.95 };
    lm[8] = { x: head.x - 0.07, y: head.y, z: head.z - 0.05, visibility: 0.95 };
    lm[11] = toLm(lSh);
    lm[12] = toLm(rSh);
    lm[13] = toLm(lEl);
    lm[14] = toLm(rEl);
    lm[15] = toLm(lWr);
    lm[16] = toLm(rWr);
    lm[17] = lm[19] = lm[21] = toLm(lWr.clone().lerp(lEl, -0.2));
    lm[18] = lm[20] = lm[22] = toLm(rWr.clone().lerp(rEl, -0.2));
    lm[23] = toLm(lHip);
    lm[24] = toLm(rHip);
    lm[25] = toLm(lKn);
    lm[26] = toLm(rKn);
    lm[27] = toLm(lAn);
    lm[28] = toLm(rAn);
    lm[29] = { x: lAn.x, y: Math.max(0.02, lAn.y - 0.04), z: lAn.z - 0.04, visibility: 0.96 };
    lm[31] = { x: lAn.x, y: Math.max(0.015, lAn.y - 0.05), z: lAn.z + 0.12, visibility: 0.96 };
    lm[30] = { x: rAn.x, y: Math.max(0.02, rAn.y - 0.04), z: rAn.z - 0.04, visibility: 0.96 };
    lm[32] = { x: rAn.x, y: Math.max(0.015, rAn.y - 0.05), z: rAn.z + 0.12, visibility: 0.96 };

    // Ground frame nicely if root started near 0
    const minFootY = Math.min(lm[31].y, lm[32].y, lm[27].y, lm[28].y);
    if (minFootY < 0) {
      const lift = -minFootY + 0.02;
      for (const p of lm) p.y += lift;
    }

    frames.push({
      timestampMs: Math.round(f * frameTime * 1000),
      landmarks: lm,
    });
  }

  if (frames.length === 0) {
    throw new Error('BVH 文件不包含有效的动作帧');
  }

    const cleanName = filename.replace(/\.bvh$/i, '');
  return {
    id: `bvh_${Date.now()}`,
    name: cleanName,
    createdAt: Date.now(),
    fps,
    durationMs: Math.round(frameCount * frameTime * 1000),
    source: 'imported',
    frames,
    datasetMeta: {
      sequenceId: cleanName.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      dancerId: 'DANCER_01',
      followerDancerId: '',
      danceStyle: '芭蕾 (Ballet)',
      clipName: cleanName,
      musicId: 'MUS_001',
      musicStartSec: 0,
      sourceLicense: 'BVH 外部动捕导入',
    },
  };
}

export async function importMotionTakeFromFile(file: File): Promise<MotionTake> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.c3d')) {
    const { parseC3dToMotionTake } = await import('@/src/utils/c3dParser');
    const buf = await file.arrayBuffer();
    return parseC3dToMotionTake(file.name, buf);
  }
  const text = await file.text();
  const take = parseImportedMotionFile(file.name, text);
  if (!take.datasetMeta) {
    take.datasetMeta = {
      sequenceId: take.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      dancerId: 'DANCER_01',
      followerDancerId: '',
      danceStyle: '芭蕾 (Ballet)',
      clipName: take.name,
      musicId: 'MUS_001',
      musicStartSec: 0,
      sourceLicense: '外部文件导入',
    };
  }
  return take;
}

export { POSE_CONNECTIONS, midpoint, lerpLandmark };
