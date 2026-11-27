import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AvatarMode,
  CameraPreset,
  CaptureSourceMode,
  DatasetSequenceMeta,
  DockTab,
  JointKey,
  Landmark3D,
  MotionTake,
  PoseFrame,
  PresetMotionId,
  WorkspaceTab,
} from '@/src/types/mocap';
import {
  computeKinematicsSummary,
  computeSelectedJointTelemetry,
  generatePresetMotionTake,
  normalizeMediaPipeWorldToStudio,
  PRESET_MOTION_CATALOG,
  smoothLandmarks,
} from '@/src/utils/poseEngine';
import {
  downloadTextFile,
  exportTakeToBvh,
  importMotionTakeFromFile,
} from '@/src/utils/bvhExporter';
import {
  buildDatasetBundleJson,
  buildDatasetManifestCsv,
  buildSmpl24Sequence,
  downloadBinaryFile,
  resampleTakeTo60Fps,
  serializeFloat32Npy,
} from '@/src/utils/datasetTools';
import {
  detectPoseOnVideoFrame,
  drawPoseOverlay2D,
  getPoseLandmarker,
} from '@/src/utils/mediapipeTracker';
import {
  loadUserTakesFromDb,
  saveUserTakesToDb,
} from '@/src/utils/offlineStorage';
import { TopBar } from '@/src/components/TopBar';
import { StudioViewport3D } from '@/src/components/StudioViewport3D';
import { CameraFeedMonitor } from '@/src/components/CameraFeedMonitor';
import { BottomControlDock } from '@/src/components/BottomControlDock';
import { ApkExportModal } from '@/src/components/ApkExportModal';

export default function App() {
  const initialTakes = useMemo<MotionTake[]>(() => {
    return PRESET_MOTION_CATALOG.map((p) => generatePresetMotionTake(p.id));
  }, []);

  const [takes, setTakes] = useState<MotionTake[]>(initialTakes);
  const [activeTakeId, setActiveTakeId] = useState<string>(initialTakes[0].id);
  const [activePresetId, setActivePresetId] = useState<PresetMotionId>('ballet_solo');

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('dataset');
  const [dockTab, setDockTab] = useState<DockTab>('dataset');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const [sourceMode, setSourceMode] = useState<CaptureSourceMode>('preset');
  const [isPlaying, setIsPlaying] = useState(true);
  const [loopPlayback, setLoopPlayback] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  const [avatarMode, setAvatarMode] = useState<AvatarMode>('mannequin');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('orbit');
  const [cameraPresetNonce, setCameraPresetNonce] = useState(0);
  const [showTrails, setShowTrails] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedJoint, setSelectedJoint] = useState<JointKey>('hips');

  const [smoothing, setSmoothing] = useState(0.35);
  const [skeletonScale, setSkeletonScale] = useState(1.0);
  const [calibratedOffsetY, setCalibratedOffsetY] = useState<number | undefined>(undefined);
  const [calibrationNote, setCalibrationNote] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const [liveLandmarks, setLiveLandmarks] = useState<Landmark3D[]>(initialTakes[0].frames[0].landmarks);
  const [followerLandmarks, setFollowerLandmarks] = useState<Landmark3D[] | null>(null);
  const liveLandmarksRef = useRef<Landmark3D[]>(initialTakes[0].frames[0].landmarks);
  const followerLandmarksRef = useRef<Landmark3D[] | null>(null);
  const smoothedLiveRef = useRef<Landmark3D[] | null>(null);
  const smoothedFollowerRef = useRef<Landmark3D[] | null>(null);
  const frameFloatRef = useRef<number>(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedCount, setRecordedCount] = useState(0);
  const recordedFramesRef = useRef<PoseFrame[]>([]);
  const recordStartTimeRef = useRef<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoObjectUrlRef = useRef<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [mirrorFeed, setMirrorFeed] = useState(true);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [trackerState, setTrackerState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [trackerMessage, setTrackerMessage] = useState('');
  const [detectedConfidence, setDetectedConfidence] = useState(0.95);
  const [apkModalOpen, setApkModalOpen] = useState(false);
  const hydratedTakesRef = useRef(false);

  const activeTake = useMemo(
    () => takes.find((t) => t.id === activeTakeId) ?? takes[0],
    [takes, activeTakeId]
  );

  const stopWebcam = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current && sourceMode === 'webcam') {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, [sourceMode]);

  const startWebcam = useCallback(
    async (overrideFacing?: 'user' | 'environment') => {
      const targetFacing = overrideFacing ?? cameraFacing;
      setTrackerState('loading');
      setTrackerMessage('正在请求摄像头并初始化姿态模型...');
      try {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
          mediaStreamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: targetFacing } },
          audio: false,
        });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);
        await getPoseLandmarker();
        setTrackerState('ready');
        setTrackerMessage('');
      } catch (err: any) {
        setCameraActive(false);
        setTrackerState('error');
        const msg =
          err?.name === 'NotAllowedError'
            ? '摄像头权限被拒绝，请在浏览器或应用设置中允许相机访问'
            : err?.message || '无法启动摄像头或加载模型';
        setTrackerMessage(msg);
      }
    },
    [cameraFacing]
  );

  const handleSwitchCameraFacing = useCallback(() => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(nextFacing);
    setMirrorFeed(nextFacing === 'user');
    if (cameraActive) {
      void startWebcam(nextFacing);
    }
  }, [cameraFacing, cameraActive, startWebcam]);

  useEffect(() => {
    let active = true;
    loadUserTakesFromDb().then((stored) => {
      if (!active) return;
      if (stored.length > 0) {
        setTakes((prev) => {
          const existingIds = new Set(stored.map((s) => s.id));
          return [...stored, ...prev.filter((t) => !existingIds.has(t.id))];
        });
      }
      hydratedTakesRef.current = true;
    });
    return () => {
      active = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hydratedTakesRef.current) return;
    void saveUserTakesToDb(takes);
  }, [takes]);

  const applyPresetFrameToRefs = useCallback(
    (frameIdx: number) => {
      const frame = activeTake.frames[frameIdx] ?? activeTake.frames[0];
      if (!frame) return;

      const scaled = frame.landmarks.map((lm) => ({
        x: lm.x * skeletonScale,
        y: lm.y * skeletonScale,
        z: lm.z * skeletonScale,
        visibility: lm.visibility,
      }));
      const smoothed = smoothLandmarks(smoothedLiveRef.current, scaled, smoothing * 0.45);
      smoothedLiveRef.current = smoothed;
      liveLandmarksRef.current = smoothed;

      if (activeTake.followerFrames && activeTake.followerFrames.length > 0) {
        const fIdx = Math.min(frameIdx, activeTake.followerFrames.length - 1);
        const fFrame = activeTake.followerFrames[fIdx];
        const fScaled = fFrame.landmarks.map((lm) => ({
          x: lm.x * skeletonScale,
          y: lm.y * skeletonScale,
          z: lm.z * skeletonScale,
          visibility: lm.visibility,
        }));
        const fSmoothed = smoothLandmarks(smoothedFollowerRef.current, fScaled, smoothing * 0.45);
        smoothedFollowerRef.current = fSmoothed;
        followerLandmarksRef.current = fSmoothed;
      } else {
        smoothedFollowerRef.current = null;
        followerLandmarksRef.current = null;
      }

      if (isRecording) {
        recordedFramesRef.current.push({
          timestampMs: Math.round(performance.now() - recordStartTimeRef.current),
          landmarks: smoothed.map((p) => ({ ...p })),
        });
      }
    },
    [activeTake, skeletonScale, smoothing, isRecording]
  );

  // Sync pose immediately when paused / scrubbed / take switched
  useEffect(() => {
    if (sourceMode !== 'preset') return;
    if (isPlaying && activeTake.frames.length > 1) return;
    frameFloatRef.current = currentFrameIdx;
    applyPresetFrameToRefs(currentFrameIdx);
    setLiveLandmarks(liveLandmarksRef.current);
    setFollowerLandmarks(followerLandmarksRef.current);
  }, [sourceMode, isPlaying, activeTake, currentFrameIdx, applyPresetFrameToRefs]);

  // Smooth 60fps rAF playback updating 3D refs every frame while throttling React HUD updates to ~15fps
  useEffect(() => {
    if (sourceMode !== 'preset' || !isPlaying || activeTake.frames.length <= 1) return;

    let rafId = 0;
    let lastTickMs = performance.now();
    let lastHudSyncMs = 0;
    let lastFrameTick = Math.floor(frameFloatRef.current);

    const step = (now: number) => {
      const dtSec = Math.min(0.1, Math.max(0, (now - lastTickMs) / 1000));
      lastTickMs = now;

      const total = activeTake.frames.length;
      let nextFloat = frameFloatRef.current + dtSec * activeTake.fps * playbackSpeed;
      let stopped = false;

      if (nextFloat >= total) {
        if (loopPlayback) {
          nextFloat = nextFloat % total;
        } else {
          nextFloat = total - 1;
          stopped = true;
        }
      }
      frameFloatRef.current = nextFloat;
      const idx = Math.max(0, Math.min(total - 1, Math.floor(nextFloat)));

      if (idx !== lastFrameTick || stopped) {
        lastFrameTick = idx;
        applyPresetFrameToRefs(idx);
      }

      if (now - lastHudSyncMs >= 66 || stopped) {
        lastHudSyncMs = now;
        setCurrentFrameIdx(idx);
        setLiveLandmarks(liveLandmarksRef.current);
        setFollowerLandmarks(followerLandmarksRef.current);
        if (isRecording) {
          setRecordedCount(recordedFramesRef.current.length);
        }
      }

      if (stopped) {
        setIsPlaying(false);
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [sourceMode, isPlaying, activeTake, playbackSpeed, loopPlayback, isRecording, applyPresetFrameToRefs]);

  useEffect(() => {
    if (sourceMode === 'preset') return;
    if (sourceMode === 'webcam' && !cameraActive) return;
    if (sourceMode === 'video' && !videoFileName) return;

    let rafId = 0;
    let cancelled = false;
    let lastVideoTime = -1;
    let lastHudSyncMs = 0;

    const runDetectionLoop = async () => {
      let landmarker: Awaited<ReturnType<typeof getPoseLandmarker>> | null = null;
      try {
        setTrackerState('loading');
        landmarker = await getPoseLandmarker();
        if (!cancelled) setTrackerState('ready');
      } catch (err: any) {
        if (!cancelled) {
          setTrackerState('error');
          setTrackerMessage(err?.message || '视觉模型加载失败，可点击“本地模型”上传 .task 文件');
        }
        return;
      }

      const step = () => {
        if (cancelled) return;
        const video = videoRef.current;
        const overlay = overlayCanvasRef.current;

        if (video && landmarker && video.readyState >= 2 && !video.paused && !video.ended) {
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const nowMs = performance.now();
            const result = detectPoseOnVideoFrame(landmarker, video, nowMs);

            if (result && result.worldLandmarks && result.worldLandmarks.length > 0) {
              const rawWorld = result.worldLandmarks[0] as Landmark3D[];
              const raw2D = (result.landmarks?.[0] ?? []) as Landmark3D[];

              const studioLm = normalizeMediaPipeWorldToStudio(
                rawWorld,
                mirrorFeed,
                skeletonScale,
                calibratedOffsetY
              );
              const smoothed = smoothLandmarks(smoothedLiveRef.current, studioLm, smoothing);
              smoothedLiveRef.current = smoothed;
              liveLandmarksRef.current = smoothed;
              followerLandmarksRef.current = null;

              if (overlay) {
                const ctx = overlay.getContext('2d');
                if (ctx) {
                  drawPoseOverlay2D(ctx, overlay.width, overlay.height, raw2D, mirrorFeed);
                }
              }

              if (isRecording) {
                recordedFramesRef.current.push({
                  timestampMs: Math.round(nowMs - recordStartTimeRef.current),
                  landmarks: smoothed.map((p) => ({ ...p })),
                });
              }

              if (nowMs - lastHudSyncMs >= 66) {
                lastHudSyncMs = nowMs;
                const avgVis =
                  rawWorld.reduce((acc, p) => acc + (p.visibility ?? 0.9), 0) / Math.max(1, rawWorld.length);
                setLiveLandmarks(smoothed);
                setFollowerLandmarks(null);
                setDetectedConfidence(avgVis);
                if (isRecording) {
                  setRecordedCount(recordedFramesRef.current.length);
                }
              }
            } else if (overlay) {
              const ctx = overlay.getContext('2d');
              ctx?.clearRect(0, 0, overlay.width, overlay.height);
            }
          }
        }
        rafId = requestAnimationFrame(step);
      };

      rafId = requestAnimationFrame(step);
    };

    runDetectionLoop();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    sourceMode,
    cameraActive,
    videoFileName,
    mirrorFeed,
    skeletonScale,
    calibratedOffsetY,
    smoothing,
    isRecording,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      } else if (e.code === 'Space' && sourceMode === 'preset') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sourceMode]);

  const handleSelectWorkspaceTab = (tab: WorkspaceTab) => {
    setWorkspaceTab(tab);
    setDockCollapsed(false);
    if (tab === 'capture') {
      setDockTab('source');
    } else if (tab === 'video') {
      setSourceMode('video');
      stopWebcam();
      setDockTab('source');
    } else if (tab === 'dataset' || tab === 'export') {
      setDockTab('dataset');
    }
  };

  const handleChangeSourceMode = (mode: CaptureSourceMode) => {
    if (mode !== 'webcam') stopWebcam();
    smoothedLiveRef.current = null;
    smoothedFollowerRef.current = null;
    setCalibratedOffsetY(undefined);
    setSourceMode(mode);
    if (mode === 'webcam') setWorkspaceTab('capture');
    else if (mode === 'video') setWorkspaceTab('video');
  };

  const handleSelectPreset = (presetId: PresetMotionId) => {
    stopWebcam();
    setSourceMode('preset');
    setActivePresetId(presetId);
    setActiveTakeId(`preset_${presetId}`);
    frameFloatRef.current = 0;
    setCurrentFrameIdx(0);
    setIsPlaying(true);
    smoothedLiveRef.current = null;
    smoothedFollowerRef.current = null;
  };

  const handleToggleRecord = () => {
    if (!isRecording) {
      recordedFramesRef.current = [];
      recordStartTimeRef.current = performance.now();
      setRecordedCount(0);
      setIsRecording(true);
    } else {
      setIsRecording(false);
      const frames = recordedFramesRef.current;
      if (frames.length > 0) {
        const takeNum = takes.filter((t) => !t.id.startsWith('preset_')).length + 1;
        const durationMs = Math.max(100, frames[frames.length - 1].timestampMs);
        const approxFps = Math.max(15, Math.min(60, Math.round((frames.length / durationMs) * 1000)));
        const seqId = `REC_${String(takeNum).padStart(4, '0')}`;
        const rawTake: MotionTake = {
          id: `rec_${Date.now()}`,
          name: `录制序列 #${takeNum}`,
          createdAt: Date.now(),
          fps: approxFps,
          durationMs,
          source: sourceMode,
          frames: frames.map((f) => ({ ...f })),
          datasetMeta: {
            sequenceId: seqId,
            dancerId: 'DANCER_01',
            followerDancerId: '',
            danceStyle: '芭蕾 (Ballet)',
            clipName: `Clip_${takeNum}`,
            musicId: 'MUS_001',
            musicStartSec: 0,
            sourceLicense: '实时采集录制',
          },
        };
        const resampled = resampleTakeTo60Fps(rawTake);
        setTakes((prev) => [resampled, ...prev]);
        stopWebcam();
        setSourceMode('preset');
        setActiveTakeId(resampled.id);
        frameFloatRef.current = 0;
        setCurrentFrameIdx(0);
        setIsPlaying(true);
        setDockTab('dataset');
        setDockCollapsed(false);
        setExportFeedback(`已保存并重采样至 60fps「${seqId}」(${resampled.frames.length} 帧)`);
      }
    }
  };

  const handleUploadVideoFile = (file: File) => {
    stopWebcam();
    if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    videoObjectUrlRef.current = url;
    setVideoFileName(file.name);
    setSourceMode('video');
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleUploadModelFile = async (file: File) => {
    try {
      setTrackerState('loading');
      const buf = new Uint8Array(await file.arrayBuffer());
      await getPoseLandmarker(buf);
      setTrackerState('ready');
      setTrackerMessage('');
    } catch (err: any) {
      setTrackerState('error');
      setTrackerMessage(err?.message || '自定义模型加载失败');
    }
  };

  const handleCalibratePose = () => {
    const footIndices = [27, 28, 29, 30, 31, 32];
    let minY = Infinity;
    for (const idx of footIndices) {
      if (liveLandmarks[idx] && liveLandmarks[idx].y < minY) minY = liveLandmarks[idx].y;
    }
    if (Number.isFinite(minY)) {
      const shift = 0.02 - minY;
      setCalibratedOffsetY((prev) => (prev ?? 0) + shift);
      setCalibrationNote('已完成地面基准归零');
      window.setTimeout(() => setCalibrationNote(null), 2600);
    }
  };

  const handleSelectTake = (take: MotionTake) => {
    stopWebcam();
    setSourceMode('preset');
    if (take.id.startsWith('preset_')) {
      setActivePresetId(take.id.replace('preset_', '') as PresetMotionId);
    }
    setActiveTakeId(take.id);
    frameFloatRef.current = 0;
    setCurrentFrameIdx(0);
    setIsPlaying(true);
    smoothedLiveRef.current = null;
    smoothedFollowerRef.current = null;
  };

  const handleDeleteTake = (takeId: string) => {
    setTakes((prev) => {
      const next = prev.filter((t) => t.id !== takeId);
      if (activeTakeId === takeId && next.length > 0) {
        setActiveTakeId(next[0].id);
        frameFloatRef.current = 0;
        setCurrentFrameIdx(0);
      }
      return next;
    });
  };

  const handleImportMotionFile = async (file: File) => {
    try {
      const imported = await importMotionTakeFromFile(file);
      const resampled = resampleTakeTo60Fps(imported);
      setTakes((prev) => [resampled, ...prev]);
      handleSelectTake(resampled);
      setDockTab('dataset');
      setExportFeedback(
        `已导入「${resampled.name}」并转码为 60fps (${resampled.frames.length} 帧)`
      );
    } catch (err: any) {
      setExportFeedback(err?.message || '文件解析失败，请确认格式为有效的 C3D / BVH / JSON');
    }
  };

  const handleAttachFollowerFile = async (file: File) => {
    try {
      const followerRaw = await importMotionTakeFromFile(file);
      const follower60 = resampleTakeTo60Fps(followerRaw);

      setTakes((prev) =>
        prev.map((t) => {
          if (t.id !== activeTakeId) return t;
          const leader60 = t.fps === 60 ? t : resampleTakeTo60Fps(t);
          // Offset follower slightly on +X/+Z if overlapping at origin
          const shiftedFollower = follower60.frames.map((fr) => ({
            ...fr,
            landmarks: fr.landmarks.map((lm) => ({
              ...lm,
              x: lm.x + 0.55,
            })),
          }));
          return {
            ...leader60,
            followerFrames: shiftedFollower,
            datasetMeta: {
              sequenceId: leader60.datasetMeta?.sequenceId || leader60.id,
              dancerId: leader60.datasetMeta?.dancerId || 'DANCER_A01',
              followerDancerId: leader60.datasetMeta?.followerDancerId || 'DANCER_B02',
              danceStyle: leader60.datasetMeta?.danceStyle || '芭蕾 (Ballet)',
              clipName: leader60.datasetMeta?.clipName || leader60.name,
              musicId: leader60.datasetMeta?.musicId || 'MUS_001',
              musicStartSec: leader60.datasetMeta?.musicStartSec ?? 0,
              sourceLicense: leader60.datasetMeta?.sourceLicense || '双人动捕配对',
            },
          };
        })
      );
      setExportFeedback(`已为当前序列绑定跟舞轨「${followerRaw.name}」，已切换为双人模式`);
    } catch (err: any) {
      setExportFeedback(err?.message || '跟舞文件导入失败');
    }
  };

  const handleClearFollowerTrack = () => {
    setTakes((prev) =>
      prev.map((t) =>
        t.id === activeTakeId
          ? {
              ...t,
              followerFrames: undefined,
              datasetMeta: t.datasetMeta ? { ...t.datasetMeta, followerDancerId: '' } : undefined,
            }
          : t
      )
    );
    followerLandmarksRef.current = null;
    setFollowerLandmarks(null);
    setExportFeedback('已移除跟舞轨道，恢复单人序列模式');
  };

  const handleResampleTo60Fps = (take: MotionTake) => {
    const resampled = resampleTakeTo60Fps(take);
    setTakes((prev) => prev.map((t) => (t.id === take.id ? resampled : t)));
    frameFloatRef.current = 0;
    setCurrentFrameIdx(0);
    setExportFeedback(`已将「${resampled.name}」重采样至 60fps (${resampled.frames.length} 帧)`);
  };

  const handleUpdateDatasetMeta = (takeId: string, patch: Partial<DatasetSequenceMeta>) => {
    setTakes((prev) =>
      prev.map((t) => {
        if (t.id !== takeId) return t;
        const base: DatasetSequenceMeta = t.datasetMeta ?? {
          sequenceId: t.id,
          dancerId: 'DANCER_01',
          followerDancerId: '',
          danceStyle: '芭蕾 (Ballet)',
          clipName: t.name,
          musicId: 'MUS_001',
          musicStartSec: 0,
          sourceLicense: '自采光学动捕',
        };
        return { ...t, datasetMeta: { ...base, ...patch } };
      })
    );
  };

  const handleExportNpyN72 = (take: MotionTake) => {
    const seqId = take.datasetMeta?.sequenceId || take.name;
    const leaderSmpl = buildSmpl24Sequence(take.frames, take.fps, `${seqId}_leader`);
    const leaderBytes = serializeFloat32Npy(leaderSmpl.jointsXYZ_N72);

    if (take.followerFrames && take.followerFrames.length > 0) {
      const followerSmpl = buildSmpl24Sequence(take.followerFrames, take.fps, `${seqId}_follower`);
      const followerBytes = serializeFloat32Npy(followerSmpl.jointsXYZ_N72);
      downloadBinaryFile(`${seqId}_leader_joints_N72.npy`, leaderBytes);
      downloadBinaryFile(`${seqId}_follower_joints_N72.npy`, followerBytes);
      setExportFeedback(
        `已导出双人 N×72 (.npy): 领舞 (${leaderSmpl.frameCount}×72) + 跟舞 (${followerSmpl.frameCount}×72)`
      );
    } else {
      downloadBinaryFile(`${seqId}_joints_N72.npy`, leaderBytes);
      setExportFeedback(`已导出 ${seqId}_joints_N72.npy (Shape: ${leaderSmpl.frameCount}×72, 60fps)`);
    }
  };

  const handleExportSmplJson = (take: MotionTake) => {
    const seqId = take.datasetMeta?.sequenceId || take.name;
    const json = buildDatasetBundleJson(take);
    downloadTextFile(`${seqId}_smpl_60fps.json`, json, 'application/json');
    const isDual = Boolean(take.followerFrames && take.followerFrames.length > 0);
    setExportFeedback(
      `已导出 ${seqId}_smpl_60fps.json（包含 ${isDual ? '领舞+跟舞 ' : ''}N×72、poses、trans、betas 与音乐起点 ${(take.datasetMeta?.musicStartSec ?? 0).toFixed(2)}s）`
    );
  };

  const handleExportManifestCsv = () => {
    const csv = buildDatasetManifestCsv(takes);
    downloadTextFile('dataset_manifest.csv', csv, 'text/csv;charset=utf-8');
    setExportFeedback(`已导出数据集清单表 dataset_manifest.csv（共 ${takes.length} 条序列记录）`);
  };

  const handleExportBvh = (take: MotionTake) => {
    try {
      const seqId = take.datasetMeta?.sequenceId || take.name;
      const bvh = exportTakeToBvh(take);
      downloadTextFile(`${seqId}.bvh`, bvh);
      setExportFeedback(`已导出 ${seqId}.bvh (${take.frames.length} 帧)`);
    } catch (err: any) {
      setExportFeedback(err?.message || '导出 BVH 失败');
    }
  };

  const jointTelemetry = useMemo(
    () => computeSelectedJointTelemetry(liveLandmarks, selectedJoint),
    [liveLandmarks, selectedJoint]
  );

  const kinematicsSummary = useMemo(
    () => computeKinematicsSummary(liveLandmarks),
    [liveLandmarks]
  );

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-[#090B0E] text-slate-100 overflow-hidden select-none">
      <TopBar
        activeTab={workspaceTab}
        onSelectTab={handleSelectWorkspaceTab}
        isRecording={isRecording}
        onToggleRecord={handleToggleRecord}
        recordedFrameCount={recordedCount}
      />

      <main className="relative flex-1 min-h-0 w-full overflow-hidden">
        <StudioViewport3D
          landmarks={liveLandmarks}
          followerLandmarks={followerLandmarks}
          liveLandmarksRef={liveLandmarksRef}
          liveFollowerLandmarksRef={followerLandmarksRef}
          avatarMode={avatarMode}
          cameraPreset={cameraPreset}
          cameraPresetNonce={cameraPresetNonce}
          selectedJoint={selectedJoint}
          onSelectJoint={(j) => {
            setSelectedJoint(j);
            setDockTab('kinematics');
          }}
          showTrails={showTrails}
          showGrid={showGrid}
        />

        <CameraFeedMonitor
          sourceMode={sourceMode}
          videoRef={videoRef}
          overlayCanvasRef={overlayCanvasRef}
          cameraActive={cameraActive}
          cameraFacing={cameraFacing}
          onSwitchCameraFacing={handleSwitchCameraFacing}
          trackerState={trackerState}
          trackerMessage={trackerMessage}
          mirrorFeed={mirrorFeed}
          onToggleMirror={() => setMirrorFeed((m) => !m)}
          onStartWebcam={() => void startWebcam()}
          onStopWebcam={stopWebcam}
          onUploadVideoFile={handleUploadVideoFile}
          onUploadModelFile={handleUploadModelFile}
          videoFileName={videoFileName}
          detectedConfidence={detectedConfidence}
        />

        <div className="hidden sm:flex absolute top-4 right-5 z-10 pointer-events-none flex-col items-end text-right gap-0.5">
          <div className="text-xs font-medium text-slate-200">
            {sourceMode === 'webcam'
              ? '实时摄像头追踪'
              : sourceMode === 'video'
              ? '本地视频骨骼提取'
              : `${activeTake.datasetMeta?.sequenceId || activeTake.name}${followerLandmarks ? ' · 双人(领舞/跟舞)' : ''}`}
          </div>
          <div className="text-[11px] font-mono-tabular text-slate-400">
            {jointTelemetry.joint.labelZh} · 骨盆高 {kinematicsSummary.pelvisHeightM.toFixed(2)}m · 音乐起点{' '}
            {(activeTake.datasetMeta?.musicStartSec ?? 0).toFixed(2)}s
          </div>
        </div>

        <BottomControlDock
          collapsed={dockCollapsed}
          onToggleCollapse={() => setDockCollapsed((c) => !c)}
          dockTab={dockTab}
          onChangeDockTab={setDockTab}
          sourceMode={sourceMode}
          onChangeSourceMode={handleChangeSourceMode}
          activePresetId={activePresetId}
          onSelectPreset={handleSelectPreset}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onStepFrame={(delta) => {
            setIsPlaying(false);
            setCurrentFrameIdx((prev) => {
              const total = activeTake.frames.length;
              const next = (prev + delta + total) % total;
              frameFloatRef.current = next;
              return next;
            });
          }}
          loopPlayback={loopPlayback}
          onToggleLoop={() => setLoopPlayback((l) => !l)}
          playbackSpeed={playbackSpeed}
          onChangeSpeed={setPlaybackSpeed}
          currentFrameIdx={currentFrameIdx}
          totalFrames={activeTake.frames.length}
          fps={activeTake.fps}
          onScrubFrame={(idx) => {
            setIsPlaying(false);
            frameFloatRef.current = idx;
            setCurrentFrameIdx(idx);
          }}
          avatarMode={avatarMode}
          onChangeAvatarMode={setAvatarMode}
          cameraPreset={cameraPreset}
          onSelectCameraPreset={(p) => {
            setCameraPreset(p);
            setCameraPresetNonce((n) => n + 1);
          }}
          showTrails={showTrails}
          onToggleTrails={() => setShowTrails((t) => !t)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((g) => !g)}
          smoothing={smoothing}
          onChangeSmoothing={setSmoothing}
          skeletonScale={skeletonScale}
          onChangeSkeletonScale={setSkeletonScale}
          onCalibratePose={handleCalibratePose}
          calibrationNote={calibrationNote}
          selectedJoint={selectedJoint}
          onSelectJoint={setSelectedJoint}
          jointTelemetry={jointTelemetry}
          kinematicsSummary={kinematicsSummary}
          takes={takes}
          activeTakeId={activeTakeId}
          onSelectTake={handleSelectTake}
          onDeleteTake={handleDeleteTake}
          onImportMotionFile={handleImportMotionFile}
          onAttachFollowerFile={handleAttachFollowerFile}
          onClearFollowerTrack={handleClearFollowerTrack}
          onResampleTo60Fps={handleResampleTo60Fps}
          onUpdateDatasetMeta={handleUpdateDatasetMeta}
          onExportNpyN72={handleExportNpyN72}
          onExportSmplJson={handleExportSmplJson}
          onExportManifestCsv={handleExportManifestCsv}
          onExportBvh={handleExportBvh}
          onOpenApkGuide={() => setApkModalOpen(true)}
          exportFeedback={exportFeedback}
        />
      </main>

      <ApkExportModal open={apkModalOpen} onClose={() => setApkModalOpen(false)} />
    </div>
  );
}
