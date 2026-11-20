import { useEffect, useState } from "react";
import { toast } from "sonner";
import { bridge } from "@/lib/bridge";
import type { NotificationPermission } from "@/lib/bridge/desktop";
import { Button } from "@/ui/controls";
import { SettingRow, SwitchRow } from "@/ui/setting-row";
import { useMail } from "@/features/mailbox/context";
import { useDesktopSettings } from "./use-desktop-settings";

const permissionLabel: Record<NotificationPermission, string> = {
  granted: "allowed by your system",
  denied: "blocked in your system settings",
  unknown: "not decided yet",
};

export function NotificationsSection() {
  const { settings, update } = useDesktopSettings();
  const { data, setSettings } = useMail();
  const [permission, setPermission] = useState<NotificationPermission>("unknown");

  useEffect(() => {
    void bridge.desktop
      .notificationPermission()
      .then(setPermission)
      .catch(() => undefined);
  }, []);

  if (!settings) return null;
  const server = data.mailbox.settings.desktopNotifications;

  return (
    <>
      <SwitchRow
        title="new mail notifications"
        description="show a system notification when mail arrives while VaelMail is in the background."
        checked={server && settings.notifications.enabled}
        onChange={async (enabled) => {
          if (enabled && permission !== "granted") {
            const result = await bridge.desktop.requestNotificationPermission();
            setPermission(result);
            if (result === "denied") {
              toast.error("notifications are blocked in your system settings");
              return;
            }
          }
          await Promise.all([
            setSettings({ desktopNotifications: enabled }),
            update((current) => ({
              ...current,
              notifications: { ...current.notifications, enabled },
            })),
          ]);
        }}
      />
      <SwitchRow
        title="show sender and subject"
        description="off by default so message details never appear on a locked or shared screen."
        checked={settings.notifications.showSender}
        onChange={(showSender) =>
          void update((current) => ({
            ...current,
            notifications: { ...current.notifications, showSender },
          }))
        }
      />
      <SettingRow
        title="system permission"
        description={`notifications are ${permissionLabel[permission]}.`}
      >
        <Button onClick={() => void bridge.desktop.testNotification()}>send a test</Button>
      </SettingRow>
      <SettingRow title="pause notifications" description="silence alerts for a while.">
        <Button onClick={() => void bridge.desktop.pauseNotifications(60)}>1 hour</Button>
        <Button onClick={() => void bridge.desktop.pauseNotifications(60 * 24)}>
          until tomorrow
        </Button>
        <Button onClick={() => void bridge.desktop.pauseNotifications(null)}>resume</Button>
      </SettingRow>
    </>
  );
}
