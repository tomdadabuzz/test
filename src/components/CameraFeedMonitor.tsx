import React, { useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  ChevronDown,
  ChevronUp,
  FlipHorizontal,
  SwitchCamera,
  Upload,
  Video,
} from 'lucide-react';
import { CaptureSourceMode } from '@/src/types/mocap';

interface CameraFeedMonitorProps {
  sourceMode: CaptureSourceMode;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  cameraFacing: 'user' | 'environment';
  onSwitchCameraFacing: () => void;
  trackerState: 'idle' | 'loading' | 'ready' | 'error';
  trackerMessage: string;
  mirrorFeed: boolean;
  onToggleMirror: () => void;
  onStartWebcam: () => void;
  onStopWebcam: () => void;
  onUploadVideoFile: (file: File) => void;
  onUploadModelFile: (file: File) => void;
  videoFileName: string | null;
  detectedConfidence: number;
}

export const CameraFeedMonitor: React.FC<CameraFeedMonitorProps> = ({
  sourceMode,
  videoRef,
  overlayCanvasRef,
  cameraActive,
  cameraFacing,
  onSwitchCameraFacing,
  trackerState,
  trackerMessage,
  mirrorFeed,
  onToggleMirror,
  onStartWebcam,
  onStopWebcam,
  onUploadVideoFile,
  onUploadModelFile,
  videoFileName,
  detectedConfidence,
}) => {
  const [minimized, setMinimized] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  if (sourceMode === 'preset') {
    return null;
  }

  return (
    <aside
      aria-label="光学视觉追踪监视窗"
      className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 w-52 sm:w-72 rounded-xl bg-[#11141A]/95 border border-white/12 shadow-xl overflow-hidden"
    >
      {/* Header strip */}
      <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 flex items-center justify-between gap-1.5 border-b border-white/8">
        <div className="flex items-center gap-1.5 min-w-0">
          {sourceMode === 'webcam' ? (
            <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          ) : (
            <Video className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="text-xs font-medium text-slate-100 truncate">
            {sourceMode === 'webcam'
              ? cameraFacing === 'user'
                ? '前置镜头'
                : '后置镜头'
              : videoFileName || '本地视频解析'}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {sourceMode === 'webcam' && (
            <button
              type="button"
              onClick={onSwitchCameraFacing}
              title="切换前置/后置摄像头"
              aria-label="切换前置/后置摄像头"
              className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center"
            >
              <SwitchCamera className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMirror}
            title="水平镜像"
            aria-label="水平镜像"
            className={`min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center ${
              mirrorFeed ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            title={minimized ? '展开监视窗' : '折叠监视窗'}
            aria-label={minimized ? '展开监视窗' : '折叠监视窗'}
            className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center"
          >
            {minimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className={minimized ? 'hidden' : 'block'}>
        <div className="relative aspect-[3/4] sm:aspect-video bg-[#090B0E] overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            loop={sourceMode === 'video'}
            controls={sourceMode === 'video' && Boolean(videoFileName)}
            className={`w-full h-full object-cover ${mirrorFeed ? '-scale-x-100' : ''}`}
          />
          <canvas
            ref={overlayCanvasRef}
            width={320}
            height={240}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {sourceMode === 'webcam' && !cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-[#090B0E]/90">
              <p className="text-[11px] text-slate-300 mb-2.5 leading-relaxed">
                授权相机后即可竖屏实时提取 33 点骨骼姿态
              </p>
              <button
                type="button"
                onClick={onStartWebcam}
                className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>开启摄像头</span>
              </button>
            </div>
          )}

          {sourceMode === 'video' && !videoFileName && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-[#090B0E]/90">
              <p className="text-[11px] text-slate-300 mb-2.5 leading-relaxed">
                导入 MP4 / WebM / MOV 视频提取动作
              </p>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>选择视频文件</span>
              </button>
            </div>
          )}
        </div>

        {/* Status & Quick Actions Footer */}
        <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 flex items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-white/8">
          <span className="truncate">
            {trackerState === 'loading' && '正在加载模型...'}
            {trackerState === 'ready' && (
              <span className="font-mono-tabular text-slate-300">
                置信 {(detectedConfidence * 100).toFixed(0)}%
              </span>
            )}
            {trackerState === 'idle' && (trackerMessage || '等待画面输入')}
            {trackerState === 'error' && <span className="text-rose-400">{trackerMessage}</span>}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            {sourceMode === 'webcam' && cameraActive && (
              <button
                type="button"
                onClick={onStopWebcam}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/8 hover:bg-white/14 text-slate-200 cursor-pointer"
              >
                <CameraOff className="w-3 h-3" />
                <span>关闭</span>
              </button>
            )}
            {sourceMode === 'video' && (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/8 hover:bg-white/14 text-slate-200 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>换视频</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => modelInputRef.current?.click()}
              title="导入本地 .task 模型并离线缓存"
              className="px-2 py-1 rounded bg-amber-500/18 hover:bg-amber-500/28 text-amber-300 cursor-pointer"
            >
              离线模型
            </button>
          </div>
        </div>
      </div>

      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadVideoFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={modelInputRef}
        type="file"
        accept=".task"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadModelFile(f);
          e.target.value = '';
        }}
      />
    </aside>
  );
};
