import React from 'react';
import { Circle, Square } from 'lucide-react';
import { WorkspaceTab } from '@/src/types/mocap';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  isRecording: boolean;
  onToggleRecord: () => void;
  recordedFrameCount: number;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'capture', label: '实时捕捉' },
  { id: 'video', label: '视频解析' },
  { id: 'dataset', label: '数据集对齐' },
  { id: 'export', label: '60fps导出' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  isRecording,
  onToggleRecord,
  recordedFrameCount,
}) => {
  return (
    <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 bg-[#0E1117] border-b border-white/10 z-20">
      {/* Zone 1: Single-element Brand Wordmark */}
      <a
        href="#studio"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('capture');
        }}
        className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-500 rounded"
      >
        动捕工坊
      </a>

      {/* Zone 2: 4 Single-line Workspace Navigation Links */}
      <nav aria-label="工作区导航" className="hidden md:flex items-center gap-7">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-500 rounded cursor-pointer ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 -bottom-[15px] h-[2px] bg-amber-500"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single Primary Studio Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onToggleRecord}
          className={`inline-flex items-center gap-2 min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 ${
            isRecording
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="font-mono-tabular">停止录制 · {recordedFrameCount}帧</span>
            </>
          ) : (
            <>
              <Circle className="w-3.5 h-3.5 fill-current" />
              <span>开始录制</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
