import { call } from "./invoke";

export type ProxyMode = "system" | "none" | "manual";

export type DesktopSettings = {
  closeToTray: boolean;
  startHidden: boolean;
  autostart: boolean;
  trayUnreadDot: boolean;
  notifications: { enabled: boolean; showSender: boolean; sound: boolean };
  updates: { auto: boolean };
  cache: { enabled: boolean; encryptedMailboxes: boolean; maxThreads: number };
  proxy: { mode: ProxyMode; url: string };
};

export type AppInfo = {
  version: string;
  os: string;
  arch: string;
  webview: string;
  cacheSize: number;
  keychain: boolean;
  packaged: "appimage" | "package" | "installer" | "portable";
  autostart: boolean;
  mailHandler: boolean;
  updates: boolean;
  dataFolder: string | null;
};

export type Mailto = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
};

export type UpdateInfo = { version: string; notes: string };

export type NotificationPermission = "granted" | "denied" | "unknown";

export const desktop = {
  settings: () => call<DesktopSettings>("desktop_settings_get"),
  saveSettings: (settings: DesktopSettings) => call<void>("desktop_settings_set", { settings }),
  info: () => call<AppInfo>("app_info"),
  notificationPermission: () => call<NotificationPermission>("notification_permission"),
  requestNotificationPermission: () => call<NotificationPermission>("notification_request"),
  testNotification: () => call<void>("notification_test"),
  pauseNotifications: (minutes: number | null) => call<void>("notification_pause", { minutes }),
  focusMain: () => call<void>("focus_main"),
  ready: () => call<void>("frontend_ready"),
  takeMailto: () => call<Mailto[]>("mailto_take"),
  registerMailHandler: () => call<boolean>("mail_handler_register"),
  testConnection: () => call<{ ok: boolean; status: number | null }>("connection_test"),
  updates: {
    supported: () => call<boolean>("updates_supported"),
    check: () => call<UpdateInfo | null>("updates_check"),
    install: () => call<void>("updates_install"),
  },
  frame: {
    publish: (html: string, csp: string) => call<{ id: string }>("frame_publish", { html, csp }),
    release: (id: string) => call<void>("frame_release", { id }),
  },
};
