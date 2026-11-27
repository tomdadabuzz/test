export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface HandLandmarks {
  left: Landmark3D[] | null;
  right: Landmark3D[] | null;
}

export interface PoseFrame {
  timestampMs: number;
  /** 33 landmarks in studio Y-up meters (root-grounded) */
  landmarks: Landmark3D[];
  /** Optional raw 2D normalized landmarks [0..1] for video overlay */
  landmarks2D?: Landmark3D[];
  hands?: HandLandmarks;
}

export type CaptureSourceMode = 'preset' | 'webcam' | 'video';

export type WorkspaceTab = 'capture' | 'video' | 'dataset' | 'export';

export type DockTab = 'source' | 'kinematics' | 'dataset';

export type AvatarMode = 'mannequin' | 'skeleton' | 'markers';

export type CameraPreset = 'orbit' | 'front' | 'side' | 'top';

export type PresetMotionId = 'ballet_solo' | 'ballet_duet' | 'walk' | 'taichi' | 'jumpshot' | 'groove' | 'tpose';

export type JointKey =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftElbow'
  | 'leftWrist'
  | 'rightShoulder'
  | 'rightElbow'
  | 'rightWrist'
  | 'leftHip'
  | 'leftKnee'
  | 'leftAnkle'
  | 'rightHip'
  | 'rightKnee'
  | 'rightAnkle';

export interface JointMeta {
  key: JointKey;
  labelZh: string;
  bvhName: string;
  landmarkIndex: number;
}

export interface DatasetSequenceMeta {
  sequenceId: string;
  dancerId: string;
  followerDancerId: string;
  danceStyle: string;
  clipName: string;
  musicId: string;
  musicStartSec: number;
  sourceLicense: string;
}

export interface MotionTake {
  id: string;
  name: string;
  createdAt: number;
  fps: number;
  durationMs: number;
  source: CaptureSourceMode | 'imported';
  frames: PoseFrame[];
  /** Optional follower (跟舞) frames for dual-person dance sequences */
  followerFrames?: PoseFrame[];
  /** Dataset manifest metadata */
  datasetMeta?: DatasetSequenceMeta;
}

export interface JointTelemetry {
  joint: JointMeta;
  position: { x: number; y: number; z: number };
  eulerDeg: { x: number; y: number; z: number };
  flexionDeg: number | null;
  confidence: number;
}

export interface StudioKinematicsSummary {
  pelvisHeightM: number;
  torsoLeanDeg: number;
  leftElbowDeg: number;
  rightElbowDeg: number;
  leftKneeDeg: number;
  rightKneeDeg: number;
  shoulderTiltDeg: number;
  avgConfidence: number;
}

export interface SmplSequenceExport {
  sequenceId: string;
  fps: number;
  frameCount: number;
  jointNames24: string[];
  /** Shape: [frameCount][72] (24 joints × xyz meters) */
  jointsXYZ_N72: number[][];
  /** Shape: [frameCount][72] (24 joints × axis-angle radians) */
  poses_N72: number[][];
  /** Shape: [frameCount][3] (root pelvis translation meters) */
  trans_N3: number[][];
  /** Shape: [10] body shape coefficients */
  betas_10: number[];
}
