import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'KinetixStudio', 'Ability onCreate');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(0x0000, 'KinetixStudio', 'Failed to load content: %{public}s', JSON.stringify(err));
        return;
      }
      try {
        const win = windowStage.getMainWindowSync();
        win.setWindowSystemBarProperties({
          statusBarColor: '#090B0E',
          statusBarContentColor: '#F1F5F9',
          navigationBarColor: '#090B0E',
          navigationBarContentColor: '#F1F5F9'
        });
      } catch (e) {
        hilog.warn(0x0000, 'KinetixStudio', 'setWindowSystemBarProperties skipped: %{public}s', JSON.stringify(e));
      }
    });
  }
}
