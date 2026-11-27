import { webview } from '@kit.ArkWeb';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

class HarmonyBridgeProxy {
  private context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  saveBase64File(filename: string, base64Data: string): void {
    const saveOptions = new picker.DocumentSaveOptions();
    saveOptions.newFileNames = [filename || 'export.dat'];
    const docPicker = new picker.DocumentViewPicker(this.context);

    docPicker.save(saveOptions).then((uris: Array<string>) => {
      if (!uris || uris.length === 0) {
        return;
      }
      const helper = new util.Base64Helper();
      const bytes: Uint8Array = helper.decodeSync(base64Data);
      const file = fileIo.openSync(uris[0], fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNCATE);
      try {
        const sliceBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        fileIo.writeSync(file.fd, sliceBuf);
      } finally {
        fileIo.closeSync(file.fd);
      }
    }).catch((err: BusinessError) => {
      console.error(`[Kinetix] Save file failed: ${err.code} ${err.message}`);
    });
  }
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private readonly localOrigin: string = 'https://kinetix.local';
  private abilityContext: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
  private bridgeProxy: HarmonyBridgeProxy = new HarmonyBridgeProxy(this.abilityContext);

  aboutToAppear(): void {
    const permissions: Array<Permissions> = ['ohos.permission.CAMERA'];
    const atManager = abilityAccessCtrl.createAtManager();
    atManager.requestPermissionsFromUser(this.abilityContext, permissions).catch((err: BusinessError) => {
      console.warn(`[Kinetix] Camera permission request warning: ${err.code} ${err.message}`);
    });
  }

  private getMimeType(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.html')) return 'text/html';
    if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript';
    if (lower.endsWith('.css')) return 'text/css';
    if (lower.endsWith('.wasm')) return 'application/wasm';
    if (lower.endsWith('.json') || lower.endsWith('.webmanifest')) return 'application/json';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.woff2')) return 'font/woff2';
    if (lower.endsWith('.woff')) return 'font/woff';
    return 'application/octet-stream';
  }

  build() {
    Column() {
      Web({
        src: `${this.localOrigin}/index.html`,
        controller: this.controller
      })
        .width('100%')
        .height('100%')
        .backgroundColor('#090B0E')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .mediaPlayGestureAccess(false)
        .mixedMode(MixedMode.All)
        .javaScriptProxy({
          object: this.bridgeProxy,
          name: 'HarmonyBridge',
          methodList: ['saveBase64File'],
          controller: this.controller
        })
        .onInterceptRequest((event) => {
          if (!event) {
            return null;
          }
          const url: string = event.request.getRequestUrl();
          if (!url.startsWith(this.localOrigin)) {
            return null;
          }

          let relPath = url.substring(this.localOrigin.length);
          const qIdx = relPath.indexOf('?');
          if (qIdx >= 0) {
            relPath = relPath.substring(0, qIdx);
          }
          const hIdx = relPath.indexOf('#');
          if (hIdx >= 0) {
            relPath = relPath.substring(0, hIdx);
          }
          if (relPath.startsWith('/')) {
            relPath = relPath.substring(1);
          }
          if (relPath === '') {
            relPath = 'index.html';
          }

          const rawAssetPath = `web/${relPath}`;
          try {
            const rawBytes = this.abilityContext.resourceManager.getRawFileContentSync(rawAssetPath);
            const buf = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
            const response = new webview.WebResourceResponse();
            response.setResponseData(buf);
            response.setResponseCode(200);
            response.setReasonMessage('OK');
            response.setResponseEncoding('utf-8');
            response.setResponseMimeType(this.getMimeType(rawAssetPath));
            const headers: Array<Header> = [
              { headerKey: 'Access-Control-Allow-Origin', headerValue: '*' },
              { headerKey: 'Access-Control-Allow-Methods', headerValue: 'GET, OPTIONS' }
            ];
            response.setResponseHeader(headers);
            return response;
          } catch {
            return null;
          }
        })
        .onPermissionRequest((event) => {
          if (!event) {
            return;
          }
          const permissions: Array<Permissions> = ['ohos.permission.CAMERA'];
          const atManager = abilityAccessCtrl.createAtManager();
          atManager.requestPermissionsFromUser(this.abilityContext, permissions).then((res) => {
            const granted = res.authResults.length > 0 && res.authResults[0] === 0;
            if (granted) {
              event.request.grant(event.request.getAccessibleResource());
            } else {
              event.request.deny();
            }
          }).catch(() => {
            event.request.deny();
          });
        })
        .onShowFileSelector((event) => {
          if (!event) {
            return false;
          }
          const selectOptions = new picker.DocumentSelectOptions();
          const docPicker = new picker.DocumentViewPicker(this.abilityContext);
          docPicker.select(selectOptions).then((uris: Array<string>) => {
            event.result.handleFileList(uris ?? []);
          }).catch(() => {
            event.result.handleFileList([]);
          });
          return true;
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#090B0E')
  }
}
