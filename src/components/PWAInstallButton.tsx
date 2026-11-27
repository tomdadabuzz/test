import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '@/src/hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-cyan-500/18 hover:bg-cyan-500/28 border border-cyan-500/40 text-xs font-medium text-cyan-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span>安装到桌面</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>添加到主屏幕</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#11141A] border border-white/12 p-5 shadow-2xl space-y-3">
              <h3 className="text-base font-semibold text-white">在 iPhone / iPad 安装动捕工坊</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. 点击 Safari 底部工具栏的 <strong>分享</strong> 按钮。<br />
                2. 向下滑动并选择 <strong>添加到主屏幕</strong>，即可全屏离线运行。
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                知道了
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/18 border border-amber-500/40 text-[11px] font-medium text-amber-200 whitespace-nowrap">
      <WifiOff className="w-3 h-3" />
      <span>离线模式 · 使用本地缓存</span>
    </div>
  );
};
