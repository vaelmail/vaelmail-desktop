import { SwitchRow } from "@/ui/setting-row";
import { useAppInfo } from "./use-app-info";
import { useDesktopSettings } from "./use-desktop-settings";

export function StartupSection() {
  const { settings, update } = useDesktopSettings();
  const info = useAppInfo();
  if (!settings) return null;
  const autostart = info?.autostart ?? true;

  return (
    <>
      <SwitchRow
        title="keep running in the tray"
        description="closing the window hides VaelMail to the system tray so new mail still reaches you."
        checked={settings.closeToTray}
        onChange={(closeToTray) => void update((current) => ({ ...current, closeToTray }))}
      />
      <SwitchRow
        title="start when you sign in"
        description={
          autostart
            ? "launch VaelMail automatically when you log in to your computer."
            : "a portable copy never registers itself with your computer, so it can't start at login."
        }
        disabled={!autostart}
        checked={settings.autostart && autostart}
        onChange={(autostart) => void update((current) => ({ ...current, autostart }))}
      />
      <SwitchRow
        title="start hidden"
        description="when launched at login, start in the tray without opening a window."
        checked={settings.startHidden}
        onChange={(startHidden) => void update((current) => ({ ...current, startHidden }))}
      />
      <SwitchRow
        title="unread indicator"
        description="mark the tray icon when you have unread mail."
        checked={settings.trayUnreadDot}
        onChange={(trayUnreadDot) => void update((current) => ({ ...current, trayUnreadDot }))}
      />
    </>
  );
}
