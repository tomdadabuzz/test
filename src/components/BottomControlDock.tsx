import React, { useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  FileCode2,
  FileSpreadsheet,
  Film,
  FolderUp,
  Grid3X3,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  AvatarMode,
  CameraPreset,
  CaptureSourceMode,
  DatasetSequenceMeta,
  DockTab,
  JointKey,
  JointTelemetry,
  MotionTake,
  PresetMotionId,
  StudioKinematicsSummary,
} from '@/src/types/mocap';
import { JOINT_CATALOG, PRESET_MOTION_CATALOG } from '@/src/utils/poseEngine';
import { AudioAlignBar } from '@/src/components/AudioAlignBar';
import { OfflineIndicator, PWAInstallButton } from '@/src/components/PWAInstallButton';

interface BottomControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  dockTab: DockTab;
  onChangeDockTab: (tab: DockTab) => void;
  // Playback & Timeline
  sourceMode: CaptureSourceMode;
  onChangeSourceMode: (mode: CaptureSourceMode) => void;
  activePresetId: PresetMotionId;
  onSelectPreset: (id: PresetMotionId) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepFrame: (delta: number) => void;
  loopPlayback: boolean;
  onToggleLoop: () => void;
  playbackSpeed: number;
  onChangeSpeed: (speed: number) => void;
  currentFrameIdx: number;
  totalFrames: number;
  fps: number;
  onScrubFrame: (frameIdx: number) => void;
  // Viewport options
  avatarMode: AvatarMode;
  onChangeAvatarMode: (mode: AvatarMode) => void;
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  showTrails: boolean;
  onToggleTrails: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  // Calibration & Filtering
  smoothing: number;
  onChangeSmoothing: (val: number) => void;
  skeletonScale: number;
  onChangeSkeletonScale: (val: number) => void;
  onCalibratePose: () => void;
  calibrationNote: string | null;
  // Kinematics
  selectedJoint: JointKey;
  onSelectJoint: (joint: JointKey) => void;
  jointTelemetry: JointTelemetry;
  kinematicsSummary: StudioKinematicsSummary;
  // Takes, Dataset Meta, Dual Follower & Export
  takes: MotionTake[];
  activeTakeId: string;
  onSelectTake: (take: MotionTake) => void;
  onDeleteTake: (takeId: string) => void;
  onImportMotionFile: (file: File) => void;
  onAttachFollowerFile: (file: File) => void;
  onClearFollowerTrack: () => void;
  onResampleTo60Fps: (take: MotionTake) => void;
  onUpdateDatasetMeta: (takeId: string, patch: Partial<DatasetSequenceMeta>) => void;
  onExportNpyN72: (take: MotionTake) => void;
  onExportSmplJson: (take: MotionTake) => void;
  onExportManifestCsv: () => void;
  onExportBvh: (take: MotionTake) => void;
  onOpenApkGuide: () => void;
  exportFeedback: string | null;
}

function formatTimecode(frameIdx: number, fps: number): string {
  const safeFps = Math.max(1, fps);
  const totalSeconds = Math.floor(frameIdx / safeFps);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const remFrames = frameIdx % safeFps;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(mins)}:${pad(secs)}:${pad(remFrames)}`;
}

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  collapsed,
  onToggleCollapse,
  dockTab,
  onChangeDockTab,
  sourceMode,
  onChangeSourceMode,
  activePresetId,
  onSelectPreset,
  isPlaying,
  onTogglePlay,
  onStepFrame,
  loopPlayback,
  onToggleLoop,
  playbackSpeed,
  onChangeSpeed,
  currentFrameIdx,
  totalFrames,
  fps,
  onScrubFrame,
  avatarMode,
  onChangeAvatarMode,
  cameraPreset,
  onSelectCameraPreset,
  showTrails,
  onToggleTrails,
  showGrid,
  onToggleGrid,
  smoothing,
  onChangeSmoothing,
  skeletonScale,
  onChangeSkeletonScale,
  onCalibratePose,
  calibrationNote,
  selectedJoint,
  onSelectJoint,
  jointTelemetry,
  kinematicsSummary,
  takes,
  activeTakeId,
  onSelectTake,
  onDeleteTake,
  onImportMotionFile,
  onAttachFollowerFile,
  onClearFollowerTrack,
  onResampleTo60Fps,
  onUpdateDatasetMeta,
  onExportNpyN72,
  onExportSmplJson,
  onExportManifestCsv,
  onExportBvh,
  onOpenApkGuide,
  exportFeedback,
}) => {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const followerInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null);

  const activeTake = takes.find((t) => t.id === activeTakeId) ?? takes[0];
  const isLiveStream = sourceMode === 'webcam';
  const hasFollower = Boolean(activeTake?.followerFrames && activeTake.followerFrames.length > 0);
  const meta: DatasetSequenceMeta = activeTake?.datasetMeta ?? {
    sequenceId: activeTake?.id || 'SEQ_0001',
    dancerId: 'DANCER_01',
    followerDancerId: hasFollower ? 'DANCER_02' : '',
    danceStyle: '芭蕾 (Ballet)',
    clipName: activeTake?.name || 'Clip_01',
    musicId: 'MUS_001',
    musicStartSec: 0,
    sourceLicense: '自采光学动捕',
  };

  return (
    <section
      aria-label="动作捕捉与数据集控制台"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(1100px,95vw)] z-20 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        collapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
      }`}
    >
      {/* Top Collapse Handle */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-[#11141A]/95 border border-b-0 border-white/10 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{collapsed ? '展开控制台 (H)' : '收起面板 (H)'}</span>
        </button>
      </div>

      {/* Main Dock Container */}
      <div className="rounded-xl bg-[#11141A]/95 border border-white/12 shadow-2xl overflow-hidden">
        {/* Row 1: Transport, Timeline Scrubber & Viewport Quick Controls */}
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/8">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onStepFrame(-1)}
              disabled={isLiveStream || totalFrames <= 1}
              title="上一帧"
              aria-label="上一帧"
              className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/8 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={isLiveStream}
              title={isPlaying ? '暂停' : '播放'}
              aria-label={isPlaying ? '暂停' : '播放'}
              className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 disabled:pointer-events-none cursor-pointer transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            <button
              type="button"
              onClick={() => onStepFrame(1)}
              disabled={isLiveStream || totalFrames <= 1}
              title="下一帧"
              aria-label="下一帧"
              className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/8 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onToggleLoop}
              disabled={isLiveStream}
              title="循环播放"
              aria-label="循环播放"
              className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-35 ${
                loopPlayback ? 'bg-white/12 text-amber-400' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>

            <select
              aria-label="播放倍速"
              value={playbackSpeed}
              disabled={isLiveStream}
              onChange={(e) => onChangeSpeed(Number(e.target.value))}
              className="ml-1 px-2 py-1 rounded-md bg-white/6 border border-white/10 text-xs font-mono-tabular text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-40"
            >
              <option value={0.25} className="bg-[#11141A]">0.25x</option>
              <option value={0.5} className="bg-[#11141A]">0.5x</option>
              <option value={1} className="bg-[#11141A]">1.0x</option>
              <option value={1.5} className="bg-[#11141A]">1.5x</option>
            </select>
          </div>

          {/* Interactive Timeline Scrubber */}
          <div className="flex-1 min-w-[200px] flex items-center gap-3">
            {isLiveStream ? (
              <div className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-md bg-white/4 border border-white/8 text-xs text-slate-300">
                <span>实时摄像头骨骼流传输中</span>
                <span className="font-mono-tabular text-cyan-400">LIVE · {fps} FPS</span>
              </div>
            ) : (
              <>
                <span className="text-xs font-mono-tabular text-slate-200 whitespace-nowrap">
                  {formatTimecode(currentFrameIdx, fps)}
                </span>
                <input
                  type="range"
                  aria-label="动作帧时间轴"
                  min={0}
                  max={Math.max(0, totalFrames - 1)}
                  value={currentFrameIdx}
                  onChange={(e) => onScrubFrame(Number(e.target.value))}
                  className="studio-slider flex-1"
                />
                <span className="text-xs font-mono-tabular text-slate-400 whitespace-nowrap">
                  {currentFrameIdx + 1} / {Math.max(1, totalFrames)} 帧 · {fps}fps
                </span>
              </>
            )}
          </div>

          {/* Viewport Render Mode & Camera Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center p-0.5 rounded-lg bg-white/5 border border-white/8">
              {(
                [
                  { id: 'mannequin', label: '模型' },
                  { id: 'skeleton', label: '骨骼' },
                  { id: 'markers', label: '点云' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangeAvatarMode(m.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    avatarMode === m.id ? 'bg-white/14 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-white/5 border border-white/8">
              {(
                [
                  { id: 'orbit', label: '全景' },
                  { id: 'front', label: '前视' },
                  { id: 'side', label: '侧视' },
                  { id: 'top', label: '俯视' },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCameraPreset(c.id)}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    cameraPreset === c.id ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleTrails}
              title="切换运动轨迹线"
              aria-label="切换运动轨迹线"
              className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                showTrails
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-white/4 border-white/8 text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleGrid}
              title="切换场地校准网格"
              aria-label="切换场地校准网格"
              className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                showGrid
                  ? 'bg-white/12 border-white/20 text-white'
                  : 'bg-white/4 border-white/8 text-slate-400 hover:text-white'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: Dock Sub-Tabs Navigation */}
        <div className="px-3 sm:px-4 pt-2 flex items-center justify-between gap-4 border-b border-white/8 overflow-x-auto studio-scroll">
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            {(
              [
                { id: 'source', label: '捕捉源与校准' },
                { id: 'kinematics', label: '关节运动学' },
                { id: 'dataset', label: `数据集与导出 (${takes.length})` },
              ] as const
            ).map((t) => {
              const active = dockTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChangeDockTab(t.id)}
                  className={`pb-2 min-h-[38px] sm:min-h-0 flex items-center text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-amber-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="pb-2 flex items-center gap-2 text-[11px] text-slate-400 whitespace-nowrap shrink-0">
            <OfflineIndicator />
            <PWAInstallButton />
            <button
              type="button"
              onClick={onOpenApkGuide}
              className="inline-flex items-center gap-1 min-h-[38px] sm:min-h-0 px-2.5 py-1 rounded-md bg-white/8 hover:bg-white/14 text-slate-200 cursor-pointer transition-colors"
            >
              <Smartphone className="w-3 h-3 text-amber-400" />
              <span>APK 打包</span>
            </button>
            <span className="hidden lg:inline text-slate-500">·</span>
            <span className="hidden lg:inline">{hasFollower ? '双人模式 (领舞 + 跟舞)' : '单人模式'}</span>
          </div>
        </div>

        {/* Row 3: Active Tab Content */}
        <div className="p-4 max-h-[340px] overflow-y-auto studio-scroll">
          {dockTab === 'source' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">信号输入源</span>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/8 hover:bg-white/14 text-[11px] text-cyan-300 cursor-pointer whitespace-nowrap"
                  >
                    <FolderUp className="w-3 h-3" />
                    <span>导入 BVH / C3D</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-white/5 border border-white/8">
                  <button
                    type="button"
                    onClick={() => onChangeSourceMode('preset')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      sourceMode === 'preset' ? 'bg-white/14 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>动捕序列</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeSourceMode('webcam')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      sourceMode === 'webcam' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>摄像头</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeSourceMode('video')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      sourceMode === 'video' ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FolderUp className="w-3.5 h-3.5" />
                    <span>本地视频</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-4 space-y-2">
                <div className="text-xs font-medium text-slate-400">内置动作参考库</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_MOTION_CATALOG.map((p) => {
                    const isSelected = sourceMode === 'preset' && activePresetId === p.id && activeTakeId === `preset_${p.id}`;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPreset(p.id)}
                        className={`px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap border ${
                          isSelected
                            ? 'bg-amber-500/18 border-amber-500/50 text-amber-200 font-medium'
                            : 'bg-white/4 border-white/8 text-slate-300 hover:bg-white/8 hover:text-white'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="smoothing-slider" className="text-xs text-slate-400 whitespace-nowrap">
                    滤波平滑度
                  </label>
                  <input
                    id="smoothing-slider"
                    type="range"
                    min={0}
                    max={0.9}
                    step={0.05}
                    value={smoothing}
                    onChange={(e) => onChangeSmoothing(Number(e.target.value))}
                    className="studio-slider flex-1"
                  />
                  <span className="text-xs font-mono-tabular text-slate-200 w-10 text-right">
                    {Math.round(smoothing * 100)}%
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="scale-slider" className="text-xs text-slate-400 whitespace-nowrap">
                    骨骼比例
                  </label>
                  <input
                    id="scale-slider"
                    type="range"
                    min={0.75}
                    max={1.25}
                    step={0.05}
                    value={skeletonScale}
                    onChange={(e) => onChangeSkeletonScale(Number(e.target.value))}
                    className="studio-slider flex-1"
                  />
                  <span className="text-xs font-mono-tabular text-slate-200 w-10 text-right">
                    {skeletonScale.toFixed(2)}x
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={onCalibratePose}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/8 hover:bg-white/14 text-xs font-medium text-slate-100 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>地面与姿态校准</span>
                  </button>
                  {calibrationNote && (
                    <span className="text-[11px] text-cyan-300 truncate">{calibrationNote}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {dockTab === 'kinematics' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5 space-y-2">
                <div className="text-xs text-slate-400">选择骨骼节点（支持直接在 3D 视口点击关节点）</div>
                <div className="max-h-28 overflow-y-auto studio-scroll pr-1 flex flex-wrap gap-1.5">
                  {JOINT_CATALOG.map((j) => {
                    const active = j.key === selectedJoint;
                    return (
                      <button
                        key={j.key}
                        type="button"
                        onClick={() => onSelectJoint(j.key)}
                        className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap border ${
                          active
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 font-medium'
                            : 'bg-white/4 border-white/8 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {j.labelZh}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-white/4 border border-white/8">
                  <div className="text-slate-400 mb-1">世界坐标 (米)</div>
                  <div className="font-mono-tabular text-slate-100 space-y-0.5">
                    <div>X: {jointTelemetry.position.x.toFixed(3)}</div>
                    <div>Y: {jointTelemetry.position.y.toFixed(3)}</div>
                    <div>Z: {jointTelemetry.position.z.toFixed(3)}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white/4 border border-white/8">
                  <div className="text-slate-400 mb-1">欧拉角 (°)</div>
                  <div className="font-mono-tabular text-slate-100 space-y-0.5">
                    <div>P: {jointTelemetry.eulerDeg.x.toFixed(1)}°</div>
                    <div>Y: {jointTelemetry.eulerDeg.y.toFixed(1)}°</div>
                    <div>R: {jointTelemetry.eulerDeg.z.toFixed(1)}°</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white/4 border border-white/8">
                  <div className="text-slate-400 mb-1">躯干与重心</div>
                  <div className="font-mono-tabular text-slate-100 space-y-0.5">
                    <div>骨盆高: {kinematicsSummary.pelvisHeightM.toFixed(2)}m</div>
                    <div>躯干倾: {kinematicsSummary.torsoLeanDeg.toFixed(1)}°</div>
                    <div>肩倾斜: {kinematicsSummary.shoulderTiltDeg.toFixed(1)}°</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white/4 border border-white/8">
                  <div className="text-slate-400 mb-1">肢体屈曲角</div>
                  <div className="font-mono-tabular text-slate-100 space-y-0.5">
                    <div>左肘: {kinematicsSummary.leftElbowDeg.toFixed(0)}° / 右: {kinematicsSummary.rightElbowDeg.toFixed(0)}°</div>
                    <div>左膝: {kinematicsSummary.leftKneeDeg.toFixed(0)}° / 右: {kinematicsSummary.rightKneeDeg.toFixed(0)}°</div>
                    {jointTelemetry.flexionDeg !== null && (
                      <div className="text-amber-300">当前: {jointTelemetry.flexionDeg.toFixed(1)}°</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {dockTab === 'dataset' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left: Sequence Queue, Dual Follower Binding & Audio Alignment */}
              <div className="lg:col-span-6 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">动作序列队列（点击切换 / 双人配对）</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/8 hover:bg-white/14 text-[11px] text-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      <FolderUp className="w-3 h-3 text-amber-400" />
                      <span>导入 BVH/C3D</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => followerInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-[11px] text-cyan-200 cursor-pointer whitespace-nowrap"
                    >
                      <Users className="w-3 h-3" />
                      <span>{hasFollower ? '替换跟舞轨' : '+ 绑定跟舞 BVH/C3D'}</span>
                    </button>
                    {hasFollower && (
                      <button
                        type="button"
                        onClick={onClearFollowerTrack}
                        className="px-2 py-1 rounded-md bg-white/6 hover:bg-white/12 text-[11px] text-slate-300 cursor-pointer whitespace-nowrap"
                      >
                        移除跟舞
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-24 overflow-y-auto studio-scroll space-y-1 pr-1">
                  {takes.map((take) => {
                    const isActive = take.id === activeTakeId && sourceMode === 'preset';
                    const isDeletable = !take.id.startsWith('preset_');
                    const isDual = Boolean(take.followerFrames && take.followerFrames.length > 0);
                    return (
                      <div
                        key={take.id}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-amber-500/12 border-amber-500/40'
                            : 'bg-white/3 border-white/8 hover:bg-white/6'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectTake(take)}
                          className="flex-1 flex items-center justify-between gap-2 text-left cursor-pointer min-w-0"
                        >
                          <span className="text-xs font-medium text-slate-100 truncate">
                            {take.datasetMeta?.sequenceId || take.name}
                          </span>
                          <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                            {isDual ? '双人' : '单人'} · {take.frames.length}帧 · {take.fps}fps
                          </span>
                        </button>

                        {take.fps !== 60 && (
                          <button
                            type="button"
                            onClick={() => onResampleTo60Fps(take)}
                            className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-[10px] font-mono-tabular text-cyan-300 cursor-pointer shrink-0"
                          >
                            转60fps
                          </button>
                        )}

                        {isDeletable && (
                          confirmClearId === take.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTake(take.id);
                                  setConfirmClearId(null);
                                }}
                                className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] cursor-pointer"
                              >
                                确认
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmClearId(null)}
                                className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmClearId(take.id)}
                              title="删除序列"
                              aria-label="删除序列"
                              className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Synchronized Audio Waveform & Offset Bar */}
                <AudioAlignBar
                  musicId={meta.musicId}
                  musicStartSec={meta.musicStartSec}
                  motionDurationSec={(activeTake?.durationMs ?? 2000) / 1000}
                  motionCurrentSec={currentFrameIdx / Math.max(1, fps)}
                  isPlaying={isPlaying && sourceMode === 'preset'}
                  playbackSpeed={playbackSpeed}
                  onChangeMusicId={(musicId) => onUpdateDatasetMeta(activeTake.id, { musicId })}
                  onChangeMusicStartSec={(musicStartSec) =>
                    onUpdateDatasetMeta(activeTake.id, { musicStartSec })
                  }
                />
              </div>

              {/* Right: Manifest Metadata Form & Dataset Exporters */}
              <div className="lg:col-span-6 space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">序列编号</span>
                    <input
                      type="text"
                      value={meta.sequenceId}
                      onChange={(e) => onUpdateDatasetMeta(activeTake.id, { sequenceId: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[#090B0E] border border-white/12 text-xs font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">{hasFollower ? '领舞编号' : '舞者编号'}</span>
                    <input
                      type="text"
                      value={meta.dancerId}
                      onChange={(e) => onUpdateDatasetMeta(activeTake.id, { dancerId: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[#090B0E] border border-white/12 text-xs font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">{hasFollower ? '跟舞编号' : '舞种'}</span>
                    {hasFollower ? (
                      <input
                        type="text"
                        value={meta.followerDancerId}
                        onChange={(e) => onUpdateDatasetMeta(activeTake.id, { followerDancerId: e.target.value })}
                        className="w-full px-2 py-1 rounded bg-[#090B0E] border border-white/12 text-xs font-mono-tabular text-cyan-200 focus:outline-none focus:border-cyan-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value={meta.danceStyle}
                        onChange={(e) => onUpdateDatasetMeta(activeTake.id, { danceStyle: e.target.value })}
                        className="w-full px-2 py-1 rounded bg-[#090B0E] border border-white/12 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    )}
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">片段名</span>
                    <input
                      type="text"
                      value={meta.clipName}
                      onChange={(e) => onUpdateDatasetMeta(activeTake.id, { clipName: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[#090B0E] border border-white/12 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">音乐编号</span>
                    <input
                      type="text"
                      value={meta.musicId}
                      onChange={(e) => onUpdateDatasetMeta(activeTake.id, { musicId: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[#090B0E] border border-white/12 text-xs font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-400">来源 / 授权</span>
                    <input
                      type="text"
                      value={meta.sourceLicense}
                      onChange={(e) => onUpdateDatasetMeta(activeTake.id, { sourceLicense: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[#090B0E] border border-white/12 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </label>
                </div>

                {/* Export Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!activeTake}
                    onClick={() => activeTake && onExportNpyN72(activeTake)}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>N×72 (.npy)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!activeTake}
                    onClick={() => activeTake && onExportSmplJson(activeTake)}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>SMPL (.json)</span>
                  </button>
                  <button
                    type="button"
                    onClick={onExportManifestCsv}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>清单表 (.csv)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!activeTake}
                    onClick={() => activeTake && onExportBvh(activeTake)}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-300" />
                    <span>导出 BVH</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {exportFeedback ||
                    '导出自动统一重采样至 60fps 并映射为 24 关节 SMPL 拓扑（N×72）；双人序列将同步输出领舞与跟舞成对数据及音乐起跳对齐秒数。'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".bvh,.c3d,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportMotionFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={followerInputRef}
        type="file"
        accept=".bvh,.c3d,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAttachFollowerFile(f);
          e.target.value = '';
        }}
      />
    </section>
  );
};
