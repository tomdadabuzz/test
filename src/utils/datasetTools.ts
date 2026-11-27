import * as THREE from 'three';
import { Landmark3D, MotionTake, PoseFrame, SmplSequenceExport } from '@/src/types/mocap';
import { lerpLandmark, midpoint } from '@/src/utils/poseEngine';

/**
 * Canonical 24 SMPL joint names in official order (0..23).
 * Total XYZ coordinates per frame = 24 × 3 = 72 floats (Shape: N × 72).
 */
export const SMPL_24_JOINT_NAMES: string[] = [
  'Pelvis',       // 0
  'L_Hip',        // 1
  'R_Hip',        // 2
  'Spine1',       // 3
  'L_Knee',       // 4
  'R_Knee',       // 5
  'Spine2',       // 6
  'L_Ankle',      // 7
  'R_Ankle',      // 8
  'Spine3',       // 9
  'L_Foot',       // 10
  'R_Foot',       // 11
  'Neck',         // 12
  'L_Collar',     // 13
  'R_Collar',     // 14
  'Head',         // 15
  'L_Shoulder',   // 16
  'R_Shoulder',   // 17
  'L_Elbow',      // 18
  'R_Elbow',      // 19
  'L_Wrist',      // 20
  'R_Wrist',      // 21
  'L_Hand',       // 22
  'R_Hand',       // 23
];

const SMPL_PARENTS: number[] = [
  -1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19, 20, 21,
];

const SMPL_CHILDREN: number[] = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, -1, -1, 15, 16, 17, -1, 18, 19, 20, 21, 22, 23, -1, -1,
];

const SMPL_REST_DIRS: THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),   // 0 Pelvis
  new THREE.Vector3(0, -1, 0),  // 1 L_Hip
  new THREE.Vector3(0, -1, 0),  // 2 R_Hip
  new THREE.Vector3(0, 1, 0),   // 3 Spine1
  new THREE.Vector3(0, -1, 0),  // 4 L_Knee
  new THREE.Vector3(0, -1, 0),  // 5 R_Knee
  new THREE.Vector3(0, 1, 0),   // 6 Spine2
  new THREE.Vector3(0, 0, 1),   // 7 L_Ankle -> Foot
  new THREE.Vector3(0, 0, 1),   // 8 R_Ankle -> Foot
  new THREE.Vector3(0, 1, 0),   // 9 Spine3
  new THREE.Vector3(0, 0, 1),   // 10 L_Foot
  new THREE.Vector3(0, 0, 1),   // 11 R_Foot
  new THREE.Vector3(0, 1, 0),   // 12 Neck
  new THREE.Vector3(1, 0, 0),   // 13 L_Collar
  new THREE.Vector3(-1, 0, 0),  // 14 R_Collar
  new THREE.Vector3(0, 1, 0),   // 15 Head
  new THREE.Vector3(1, 0, 0),   // 16 L_Shoulder
  new THREE.Vector3(-1, 0, 0),  // 17 R_Shoulder
  new THREE.Vector3(1, 0, 0),   // 18 L_Elbow
  new THREE.Vector3(-1, 0, 0),  // 19 R_Elbow
  new THREE.Vector3(1, 0, 0),   // 20 L_Wrist
  new THREE.Vector3(-1, 0, 0),  // 21 R_Wrist
  new THREE.Vector3(1, 0, 0),   // 22 L_Hand
  new THREE.Vector3(-1, 0, 0),  // 23 R_Hand
];

function extractSmpl24Joints(lm: Landmark3D[]): THREE.Vector3[] {
  const lHip = lm[23];
  const rHip = lm[24];
  const lSh = lm[11];
  const rSh = lm[12];
  const pelvis = midpoint(lHip, rHip);
  const shMid = midpoint(lSh, rSh);

  const spine1 = lerpLandmark(pelvis, shMid, 0.28);
  const spine2 = lerpLandmark(pelvis, shMid, 0.56);
  const spine3 = lerpLandmark(pelvis, shMid, 0.82);
  const neck = lerpLandmark(shMid, lm[0], 0.35);
  const lCollar = lerpLandmark(spine3, lSh, 0.45);
  const rCollar = lerpLandmark(spine3, rSh, 0.45);

  const lHand = midpoint(lm[15], lm[19] ?? lm[15]);
  const rHand = midpoint(lm[16], lm[20] ?? lm[16]);

  const arr = [
    pelvis,      // 0
    lHip,        // 1
    rHip,        // 2
    spine1,      // 3
    lm[25],      // 4 L_Knee
    lm[26],      // 5 R_Knee
    spine2,      // 6
    lm[27],      // 7 L_Ankle
    lm[28],      // 8 R_Ankle
    spine3,      // 9
    lm[31],      // 10 L_Foot
    lm[32],      // 11 R_Foot
    neck,        // 12
    lCollar,     // 13
    rCollar,     // 14
    lm[0],       // 15 Head
    lSh,         // 16 L_Shoulder
    rSh,         // 17 R_Shoulder
    lm[13],      // 18 L_Elbow
    lm[14],      // 19 R_Elbow
    lm[15],      // 20 L_Wrist
    lm[16],      // 21 R_Wrist
    lHand,       // 22 L_Hand
    rHand,       // 23 R_Hand
  ];

  return arr.map((p) => new THREE.Vector3(p.x, p.y, p.z));
}

function quatToAxisAngle(q: THREE.Quaternion): [number, number, number] {
  const nq = q.clone().normalize();
  if (nq.w < 0) nq.set(-nq.x, -nq.y, -nq.z, -nq.w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - nq.w * nq.w));
  const angle = 2 * Math.atan2(sinHalf, nq.w);
  if (sinHalf < 1e-6) return [0, 0, 0];
  return [(nq.x / sinHalf) * angle, (nq.y / sinHalf) * angle, (nq.z / sinHalf) * angle];
}

/**
 * Resample any PoseFrame[] sequence to uniform 60.0 fps (or targetFps).
 */
export function resampleFramesToFps(frames: PoseFrame[], sourceFps: number, targetFps = 60): PoseFrame[] {
  if (frames.length <= 1) return frames.map((f) => ({ ...f }));
  if (sourceFps === targetFps) return frames.map((f) => ({ ...f }));

  const lastTs = frames[frames.length - 1].timestampMs > 0
    ? frames[frames.length - 1].timestampMs
    : ((frames.length - 1) / sourceFps) * 1000;

  const durationSec = Math.max(0.05, lastTs / 1000);
  const targetCount = Math.max(2, Math.round(durationSec * targetFps) + 1);
  const out: PoseFrame[] = [];

  for (let i = 0; i < targetCount; i++) {
    const tMs = (i / targetFps) * 1000;
    const exactSrcIdx = (tMs / lastTs) * (frames.length - 1);
    const idx0 = Math.max(0, Math.min(frames.length - 1, Math.floor(exactSrcIdx)));
    const idx1 = Math.max(0, Math.min(frames.length - 1, idx0 + 1));
    const alpha = exactSrcIdx - idx0;

    const f0 = frames[idx0];
    const f1 = frames[idx1];
    const landmarks = f0.landmarks.map((lm, k) => lerpLandmark(lm, f1.landmarks[k] ?? lm, alpha));

    out.push({
      timestampMs: Math.round(tMs),
      landmarks,
    });
  }
  return out;
}

export function resampleTakeTo60Fps(take: MotionTake): MotionTake {
  const frames60 = resampleFramesToFps(take.frames, take.fps, 60);
  const follower60 = take.followerFrames
    ? resampleFramesToFps(take.followerFrames, take.fps, 60)
    : undefined;

  return {
    ...take,
    fps: 60,
    durationMs: Math.round((frames60.length / 60) * 1000),
    frames: frames60,
    followerFrames: follower60,
  };
}

/**
 * Convert frames into 60fps N×72 XYZ coordinates and SMPL poses (N×72) + trans (N×3) + betas (10).
 */
export function buildSmpl24Sequence(
  framesInput: PoseFrame[],
  sourceFps: number,
  sequenceId: string
): SmplSequenceExport {
  const frames60 = resampleFramesToFps(framesInput, sourceFps, 60);
  const jointsXYZ_N72: number[][] = [];
  const poses_N72: number[][] = [];
  const trans_N3: number[][] = [];

  const _dir = new THREE.Vector3();
  const _x = new THREE.Vector3();
  const _y = new THREE.Vector3();
  const _z = new THREE.Vector3();
  const _mat = new THREE.Matrix4();

  for (const frame of frames60) {
    const pts = extractSmpl24Joints(frame.landmarks);

    // 1. N × 72 XYZ coordinates
    const xyzRow: number[] = [];
    for (const p of pts) {
      xyzRow.push(
        Number(p.x.toFixed(5)),
        Number(p.y.toFixed(5)),
        Number(p.z.toFixed(5))
      );
    }
    jointsXYZ_N72.push(xyzRow);

    // 2. trans (N × 3) from Pelvis root
    trans_N3.push([
      Number(pts[0].x.toFixed(5)),
      Number(pts[0].y.toFixed(5)),
      Number(pts[0].z.toFixed(5)),
    ]);

    // 3. SMPL poses (N × 72 axis-angle radians)
    const worldQuats: THREE.Quaternion[] = Array.from({ length: 24 }, () => new THREE.Quaternion());
    // Root orientation (Pelvis basis)
    _x.copy(pts[1]).sub(pts[2]).normalize();
    _y.copy(pts[3]).sub(pts[0]).normalize();
    _z.crossVectors(_x, _y).normalize();
    _y.crossVectors(_z, _x).normalize();
    _mat.makeBasis(_x, _y, _z);
    worldQuats[0].setFromRotationMatrix(_mat);

    for (let j = 1; j < 24; j++) {
      const child = SMPL_CHILDREN[j];
      const parent = SMPL_PARENTS[j];
      if (child !== -1) {
        _dir.copy(pts[child]).sub(pts[j]);
        if (_dir.lengthSq() > 1e-6) {
          _dir.normalize();
          worldQuats[j].setFromUnitVectors(SMPL_REST_DIRS[j], _dir);
        } else {
          worldQuats[j].copy(worldQuats[parent]);
        }
      } else {
        worldQuats[j].copy(worldQuats[parent]);
      }
    }

    const poseRow: number[] = [];
    for (let j = 0; j < 24; j++) {
      const parent = SMPL_PARENTS[j];
      let localQ: THREE.Quaternion;
      if (parent === -1) {
        localQ = worldQuats[j];
      } else {
        localQ = worldQuats[parent].clone().invert().multiply(worldQuats[j]);
      }
      const [rx, ry, rz] = quatToAxisAngle(localQ);
      poseRow.push(Number(rx.toFixed(5)), Number(ry.toFixed(5)), Number(rz.toFixed(5)));
    }
    poses_N72.push(poseRow);
  }

  return {
    sequenceId,
    fps: 60,
    frameCount: frames60.length,
    jointNames24: SMPL_24_JOINT_NAMES,
    jointsXYZ_N72,
    poses_N72,
    trans_N3,
    betas_10: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

/**
 * Serialize a 2D float matrix [rows][cols] into a genuine NumPy .npy (v1.0) binary file.
 * Directly readable in Python with `np.load("file.npy")`.
 */
export function serializeFloat32Npy(matrix: number[][]): Uint8Array {
  const rows = matrix.length;
  const cols = rows > 0 ? matrix[0].length : 0;

  const dict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${rows}, ${cols}), }`;
  const magicLen = 10; // 6 magic + 2 version + 2 headerLen
  const rawHeaderBytes = new TextEncoder().encode(dict);
  const padNeeded = (16 - ((magicLen + rawHeaderBytes.length + 1) % 16)) % 16;
  const headerLen = rawHeaderBytes.length + padNeeded + 1; // +1 for '\n'

  const totalBytes = magicLen + headerLen + rows * cols * 4;
  const out = new Uint8Array(totalBytes);
  const dv = new DataView(out.buffer);

  // Magic "\x93NUMPY" + version 1.0
  out[0] = 0x93;
  out[1] = 0x4e; // N
  out[2] = 0x55; // U
  out[3] = 0x4d; // M
  out[4] = 0x50; // P
  out[5] = 0x59; // Y
  out[6] = 1;
  out[7] = 0;
  dv.setUint16(8, headerLen, true);

  out.set(rawHeaderBytes, 10);
  for (let i = 0; i < padNeeded; i++) {
    out[10 + rawHeaderBytes.length + i] = 0x20; // space
  }
  out[10 + rawHeaderBytes.length + padNeeded] = 0x0a; // newline

  let offset = magicLen + headerLen;
  for (let r = 0; r < rows; r++) {
    const row = matrix[r];
    for (let c = 0; c < cols; c++) {
      dv.setFloat32(offset, row[c] ?? 0, true);
      offset += 4;
    }
  }

  return out;
}

export function downloadBinaryFile(filename: string, data: Uint8Array, mime = 'application/octet-stream') {
  const bridge = (window as unknown as {
    HarmonyBridge?: { saveBase64File?: (name: string, b64: string) => void };
  }).HarmonyBridge;
  if (bridge?.saveBase64File) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < data.length; i += chunkSize) {
      binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
    }
    bridge.saveBase64File(filename, btoa(binary));
    return;
  }

  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy.buffer], { type: mime });
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
 * Build UTF-8 BOM CSV manifest table with all requested dataset fields.
 */
export function buildDatasetManifestCsv(takes: MotionTake[]): string {
  const headers = [
    '序列编号',
    '舞者编号',
    '跟舞编号',
    '人数模式',
    '舞种',
    '片段名',
    '帧数(60fps)',
    '时长(s)',
    '音乐编号',
    '动作起始音乐秒数(s)',
    '来源/授权',
  ];

  const escapeCsv = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = [headers.join(',')];
  takes.forEach((t, idx) => {
    const meta = t.datasetMeta;
    const isDual = Boolean(t.followerFrames && t.followerFrames.length > 0);
    const durSec = t.durationMs / 1000;
    const framesAt60 = Math.max(1, Math.round(durSec * 60));

    rows.push(
      [
        meta?.sequenceId || `SEQ_${String(idx + 1).padStart(4, '0')}`,
        meta?.dancerId || 'DANCER_01',
        isDual ? meta?.followerDancerId || 'DANCER_02' : '-',
        isDual ? '双人(领舞+跟舞)' : '单人',
        meta?.danceStyle || '芭蕾 (Ballet)',
        meta?.clipName || t.name,
        framesAt60,
        durSec.toFixed(3),
        meta?.musicId || 'MUS_001',
        (meta?.musicStartSec ?? 0).toFixed(3),
        meta?.sourceLicense || '自采动捕数据',
      ]
        .map(escapeCsv)
        .join(',')
    );
  });

  // Prepend UTF-8 BOM so Excel opens Chinese characters cleanly
  return '\uFEFF' + rows.join('\n');
}

/**
 * Export complete 60fps dataset JSON bundle (supports both Solo & Dual Leader/Follower).
 */
export function buildDatasetBundleJson(take: MotionTake): string {
  const meta = take.datasetMeta;
  const seqId = meta?.sequenceId || take.id;
  const leaderSmpl = buildSmpl24Sequence(take.frames, take.fps, `${seqId}_leader`);
  const hasFollower = Boolean(take.followerFrames && take.followerFrames.length > 0);
  const followerSmpl = hasFollower
    ? buildSmpl24Sequence(take.followerFrames!, take.fps, `${seqId}_follower`)
    : null;

  const payload: Record<string, unknown> = {
    schema: 'kinetix-dance-dataset-v1',
    sequence_id: seqId,
    mode: hasFollower ? 'dual' : 'single',
    dance_style: meta?.danceStyle || '芭蕾 (Ballet)',
    clip_name: meta?.clipName || take.name,
    fps: 60,
    duration_sec: Number((leaderSmpl.frameCount / 60).toFixed(4)),
    audio_alignment: {
      music_id: meta?.musicId || 'MUS_001',
      music_start_sec: meta?.musicStartSec ?? 0,
      note: 'Frame 0 of motion corresponds to music_start_sec in the paired audio file.',
    },
    source_license: meta?.sourceLicense || '自采动捕数据',
    joint_names_24: SMPL_24_JOINT_NAMES,
  };

  if (hasFollower && followerSmpl) {
    payload.leader = {
      dancer_id: meta?.dancerId || 'DANCER_01',
      joints_xyz_N72: leaderSmpl.jointsXYZ_N72,
      smpl_poses_N72: leaderSmpl.poses_N72,
      smpl_trans_N3: leaderSmpl.trans_N3,
      smpl_betas_10: leaderSmpl.betas_10,
    };
    payload.follower = {
      dancer_id: meta?.followerDancerId || 'DANCER_02',
      joints_xyz_N72: followerSmpl.jointsXYZ_N72,
      smpl_poses_N72: followerSmpl.poses_N72,
      smpl_trans_N3: followerSmpl.trans_N3,
      smpl_betas_10: followerSmpl.betas_10,
    };
  } else {
    payload.dancer_id = meta?.dancerId || 'DANCER_01';
    payload.joints_xyz_N72 = leaderSmpl.jointsXYZ_N72;
    payload.smpl_poses_N72 = leaderSmpl.poses_N72;
    payload.smpl_trans_N3 = leaderSmpl.trans_N3;
    payload.smpl_betas_10 = leaderSmpl.betas_10;
  }

  return JSON.stringify(payload, null, 2);
}

/**
 * Generate a 12-second 3/4 Ballet Waltz reference WAV track in-memory for instant audio alignment testing.
 */
export function createReferenceWaltzWavBlob(durationSec = 12): Blob {
  const sampleRate = 22050;
  const totalSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  // 3/4 Waltz at 108 BPM (beat = 0.555s)
  const beatDur = 60 / 108;
  const chords = [
    [261.63, 329.63, 392.0], // C major
    [220.0, 261.63, 329.63], // A minor
    [174.61, 220.0, 261.63], // F major
    [196.0, 246.94, 293.66], // G major
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIdx = Math.floor(t / beatDur);
    const beatPos = (t % beatDur) / beatDur;
    const barBeat = beatIdx % 3;
    const chord = chords[Math.floor(beatIdx / 3) % chords.length];

    const env = Math.exp(-beatPos * (barBeat === 0 ? 4.5 : 7.0));
    let sample = 0;
    if (barBeat === 0) {
      sample += Math.sin(2 * Math.PI * (chord[0] * 0.5) * t) * 0.45 * env;
    } else {
      for (const freq of chord) {
        sample += Math.sin(2 * Math.PI * freq * t) * 0.14 * env;
      }
    }
    const clamped = Math.max(-0.95, Math.min(0.95, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
