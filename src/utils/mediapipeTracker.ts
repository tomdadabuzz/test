import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { Landmark3D } from '@/src/types/mocap';
import { POSE_CONNECTIONS } from '@/src/utils/poseEngine';
import { loadCachedModelBuffer, saveCachedModelBuffer } from '@/src/utils/offlineStorage';

const MODEL_CACHE_KEY = 'pose_landmarker_lite_v1';

const POSE_MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
];

let landmarkerInstance: PoseLandmarker | null = null;
let initPromise: Promise<PoseLandmarker> | null = null;
let currentModelSource: 'cached' | 'network' | 'local' | null = null;

export function getModelCacheSource(): 'cached' | 'network' | 'local' | null {
  return currentModelSource;
}

async function createLandmarkerFromBuffer(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  buffer: Uint8Array
): Promise<PoseLandmarker> {
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetBuffer: buffer.slice(),
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetBuffer: buffer.slice(),
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }
}

export async function getPoseLandmarker(customModelBuffer?: Uint8Array): Promise<PoseLandmarker> {
  if (landmarkerInstance && !customModelBuffer) {
    return landmarkerInstance;
  }

  if (initPromise && !customModelBuffer) {
    return initPromise;
  }

  const loader = (async () => {
    const wasmBase = `${import.meta.env.BASE_URL}mediapipe/wasm`;
    const vision = await FilesetResolver.forVisionTasks(wasmBase);

    if (customModelBuffer) {
      if (landmarkerInstance) {
        landmarkerInstance.close();
        landmarkerInstance = null;
      }
      await saveCachedModelBuffer(MODEL_CACHE_KEY, customModelBuffer);
      landmarkerInstance = await createLandmarkerFromBuffer(vision, customModelBuffer);
      currentModelSource = 'local';
      return landmarkerInstance;
    }

    // 1. Try offline IndexedDB cached model first
    const cachedBuf = await loadCachedModelBuffer(MODEL_CACHE_KEY);
    if (cachedBuf && cachedBuf.byteLength > 100000) {
      try {
        landmarkerInstance = await createLandmarkerFromBuffer(vision, cachedBuf);
        currentModelSource = 'cached';
        return landmarkerInstance;
      } catch {
        // Fall through to network fetch if cached buffer was corrupted
      }
    }

    // 2. Fetch model weights from CDN and cache to IndexedDB for future offline use
    let lastErr: unknown = null;
    for (const url of POSE_MODEL_URLS) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = new Uint8Array(await resp.arrayBuffer());
        await saveCachedModelBuffer(MODEL_CACHE_KEY, buf);
        landmarkerInstance = await createLandmarkerFromBuffer(vision, buf);
        currentModelSource = 'network';
        return landmarkerInstance;
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr ?? new Error('无法加载 MediaPipe 姿态模型权重，请联网或导入本地 .task 文件');
  })();

  if (!customModelBuffer) {
    initPromise = loader.catch((err) => {
      initPromise = null;
      throw err;
    });
  }

  return loader;
}

export function detectPoseOnVideoFrame(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  timestampMs: number
): PoseLandmarkerResult | null {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }
  return landmarker.detectForVideo(video, timestampMs);
}

export function drawPoseOverlay2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks2D: Landmark3D[] | undefined,
  mirrorX = false
) {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks2D || landmarks2D.length < 33) return;

  const mapX = (x: number) => (mirrorX ? (1 - x) * width : x * width);
  const mapY = (y: number) => y * height;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.88)';
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = landmarks2D[a];
    const lb = landmarks2D[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 1) < 0.3 || (lb.visibility ?? 1) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(mapX(la.x), mapY(la.y));
    ctx.lineTo(mapX(lb.x), mapY(lb.y));
    ctx.stroke();
  }

  for (let i = 0; i < landmarks2D.length; i++) {
    const lm = landmarks2D[i];
    if ((lm.visibility ?? 1) < 0.3) continue;
    const isMajor = i === 0 || (i >= 11 && i <= 16) || (i >= 23 && i <= 28);
    ctx.beginPath();
    ctx.arc(mapX(lm.x), mapY(lm.y), isMajor ? 3.5 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = isMajor ? '#F59E0B' : '#E2E8F0';
    ctx.fill();
  }
}
