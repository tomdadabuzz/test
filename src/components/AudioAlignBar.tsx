import React, { useEffect, useRef, useState } from 'react';
import { Music, Upload, Volume2, VolumeX } from 'lucide-react';
import { createReferenceWaltzWavBlob } from '@/src/utils/datasetTools';

interface AudioAlignBarProps {
  musicId: string;
  musicStartSec: number;
  motionDurationSec: number;
  motionCurrentSec: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onChangeMusicId: (id: string) => void;
  onChangeMusicStartSec: (sec: number) => void;
}

export const AudioAlignBar: React.FC<AudioAlignBarProps> = ({
  musicId,
  musicStartSec,
  motionDurationSec,
  motionCurrentSec,
  isPlaying,
  playbackSpeed,
  onChangeMusicId,
  onChangeMusicStartSec,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLabel, setAudioLabel] = useState<string>('未加载音频');
  const [audioDuration, setAudioDuration] = useState<number>(12);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [muted, setMuted] = useState(true);
  const autoplayBlockedRef = useRef(false);

  const decodeAudioPeaks = async (blobOrFile: Blob, label: string) => {
    try {
      const arr = await blobOrFile.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const decoded = await ctx.decodeAudioData(arr);
      const ch = decoded.getChannelData(0);
      const bars = 96;
      const step = Math.max(1, Math.floor(ch.length / bars));
      const nextPeaks: number[] = [];
      for (let i = 0; i < bars; i++) {
        let max = 0;
        const start = i * step;
        for (let j = 0; j < step && start + j < ch.length; j += Math.max(1, Math.floor(step / 16))) {
          const v = Math.abs(ch[start + j]);
          if (v > max) max = v;
        }
        nextPeaks.push(max);
      }
      setPeaks(nextPeaks);
      setAudioDuration(decoded.duration);
      setAudioLabel(label);
      ctx.close().catch(() => {});
    } catch {
      setPeaks(Array.from({ length: 96 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.4)) * 0.5));
      setAudioLabel(label);
    }
  };

  // Load built-in 3/4 Waltz track initially so waveform & sync work right away
  useEffect(() => {
    const blob = createReferenceWaltzWavBlob(12);
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    decodeAudioPeaks(blob, '内置芭蕾 3/4 华尔兹参考曲 (12.0s)');
    return () => {
      URL.revokeObjectURL(url);
    };
  }, []);

  const handleLoadAudioFile = (file: File) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    autoplayBlockedRef.current = false;
    setMuted(false);
    const cleanId = file.name.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    onChangeMusicId(cleanId || 'MUS_CUSTOM');
    decodeAudioPeaks(file, file.name);
  };

  // Sync HTMLAudioElement with 3D motion timeline without spamming play() when blocked
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    el.muted = muted;
    el.playbackRate = Math.max(0.25, Math.min(2.0, playbackSpeed));

    const targetAudioTime = Math.max(0, Math.min(audioDuration, musicStartSec + motionCurrentSec));
    if (isPlaying && !muted && targetAudioTime < audioDuration) {
      if (Math.abs(el.currentTime - targetAudioTime) > 0.25) {
        el.currentTime = targetAudioTime;
      }
      if (el.paused && !autoplayBlockedRef.current) {
        el.play().catch(() => {
          autoplayBlockedRef.current = true;
          setMuted(true);
        });
      }
    } else if (!el.paused) {
      el.pause();
    }
  }, [audioUrl, muted, isPlaying, motionCurrentSec, musicStartSec, playbackSpeed, audioDuration]);

  // Render waveform canvas with highlighted aligned motion window
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Highlight aligned motion window [musicStartSec, musicStartSec + motionDurationSec]
    const dur = Math.max(0.1, audioDuration);
    const xStart = (musicStartSec / dur) * w;
    const xEnd = ((musicStartSec + motionDurationSec) / dur) * w;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
    ctx.fillRect(xStart, 0, Math.max(4, xEnd - xStart), h);

    // Waveform bars
    const count = peaks.length || 96;
    const barW = w / count;
    for (let i = 0; i < count; i++) {
      const amp = peaks[i] ?? 0.3;
      const barH = Math.max(3, amp * (h - 6));
      const x = i * barW;
      const inWindow = x >= xStart && x <= xEnd;
      ctx.fillStyle = inWindow ? '#F59E0B' : 'rgba(148, 163, 184, 0.42)';
      ctx.fillRect(x + 0.5, (h - barH) / 2, Math.max(1, barW - 1.5), barH);
    }

    // Current playhead cursor
    const curX = ((musicStartSec + motionCurrentSec) / dur) * w;
    ctx.fillStyle = '#22D3EE';
    ctx.fillRect(curX - 1, 0, 2, h);
  }, [peaks, audioDuration, musicStartSec, motionDurationSec, motionCurrentSec]);

  return (
    <div className="p-2.5 rounded-lg bg-white/4 border border-white/8 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Music className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-slate-200 truncate">{audioLabel}</span>
          <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
            总长 {audioDuration.toFixed(2)}s
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span>动作起跳点</span>
            <input
              type="number"
              min={0}
              max={Math.max(0, Number(audioDuration.toFixed(2)))}
              step={0.05}
              value={musicStartSec}
              onChange={(e) => onChangeMusicStartSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 px-1.5 py-0.5 rounded bg-[#090B0E] border border-white/15 text-xs font-mono-tabular text-amber-300 focus:outline-none focus:border-amber-500"
            />
            <span>秒</span>
          </label>

          <button
            type="button"
            onClick={() => {
              autoplayBlockedRef.current = false;
              setMuted((m) => !m);
            }}
            title={muted ? '开启音乐声音' : '静音'}
            aria-label={muted ? '开启音乐声音' : '静音'}
            className={`p-1.5 rounded border cursor-pointer transition-colors ${
              muted
                ? 'bg-white/4 border-white/10 text-slate-400'
                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
            }`}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/8 hover:bg-white/14 text-[11px] font-medium text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3 h-3 text-amber-400" />
            <span>导入伴奏音频</span>
          </button>
        </div>
      </div>

      {/* Clickable Audio Waveform to set start offset */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={560}
          height={36}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            onChangeMusicStartSec(Number((frac * audioDuration).toFixed(2)));
          }}
          title="点击波形任意位置设置动作从音乐第几秒开始"
          className="w-full h-9 rounded bg-[#090B0E] border border-white/8 cursor-pointer"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
          <span>音乐编号: {musicId}</span>
          <span>
            对齐区间: {musicStartSec.toFixed(2)}s → {(musicStartSec + motionDurationSec).toFixed(2)}s
          </span>
        </div>
      </div>

      <audio ref={audioRef} src={audioUrl ?? undefined} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleLoadAudioFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
};
