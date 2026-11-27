import React from 'react';
import { CheckCircle2, Smartphone, X } from 'lucide-react';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';

interface ApkExportModalProps {
  open: boolean;
  onClose: () => void;
}

export const ApkExportModal: React.FC<ApkExportModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="安卓 APK 打包与离线安装说明"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#11141A] border border-white/12 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold text-white">安卓 APK 打包与手机安装</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/8 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <div className="p-3 rounded-xl bg-white/4 border border-white/8 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-white">方式一：手机浏览器直接安装为离线 App（即刻可用）</span>
              <PWAInstallButton />
            </div>
            <p className="text-slate-400">
              已配置完整 PWA 清单与 Workbox 离线缓存（含 MediaPipe WASM 与本地模型缓存）。在手机 Chrome / Edge 点击「安装到桌面」或浏览器菜单「添加到主屏幕」，即可全屏离线运行。
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white/4 border border-white/8 space-y-2">
            <div className="font-semibold text-white">方式二：通过 Capacitor 工程编译独立 .apk 安装包</div>
            <ul className="space-y-1.5 text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>已生成完整原生工程与相机权限配置（支持前后镜头与硬件加速 WebGL2）。</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>已附带 GitHub Actions 自动构建脚本：推送到 GitHub 仓库后，在 Actions 页面即可直接下载编译好的 <span className="font-mono-tabular text-amber-300">app-debug.apk</span>。</span>
              </li>
            </ul>
            <div className="p-2.5 rounded-lg bg-[#090B0E] border border-white/8 font-mono-tabular text-[11px] text-slate-200 overflow-x-auto">
              <div>npm install &amp;&amp; npm run build</div>
              <div>npx cap sync android</div>
              <div>cd android &amp;&amp; ./gradlew assembleDebug</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
