# 动捕工坊 · HarmonyOS NEXT 工程说明

本目录为适配 **HarmonyOS NEXT（API 12 / 5.0+）** 的原生 ArkWeb 壳工程，已内置：
- 虚拟 HTTPS 域名拦截器（`https://kinetix.local` -> `rawfile/web/`），完整支持 Vite ES Module 与 MediaPipe `.wasm` 本地离线加载；
- 动态相机权限申请与 `WebView.onPermissionRequest` 放行，支持前置/后置实时动作捕捉；
- `onShowFileSelector` 文件选择器桥接（导入 `.bvh` / `.c3d` / 视频 / 音频 / `.task` 模型）；
- `HarmonyBridge.saveBase64File` 原生导出桥接（导出 `.bvh`、`N×72 (.npy)`、SMPL `.json` 与清单 `.csv` 到手机文件管理器）。

## 打包步骤

1. 在项目根目录同步最新前端静态资源（沙盒已提前同步过一次，若改了前端代码请重新运行）：
   ```bash
   npm run harmony:sync
   ```
2. 下载华为官方 **DevEco Studio 5.0+** 并打开本工程的 `harmonyos/` 目录；
3. 连接鸿蒙 NEXT 真机（开启 USB 调试），点击右上角 **File → Project Structure → Signing Configs** 一键自动生成调试签名（或绑定您的华为发布证书）；
4. 点击顶部 **Build → Build Hap(s)/APP(s) → Build Hap(s)** 或直接点击绿色 **Run** 按钮即可安装到鸿蒙 NEXT 手机运行。
