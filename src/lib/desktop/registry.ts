export type Bounds = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export type AppIconName =
  | "mail"
  | "compose"
  | "contacts"
  | "services"
  | "aliases"
  | "settings"
  | "person"
  | "shield"
  | "key"
  | "billing"
  | "data"
  | "domains"
  | "appearance"
  | "desktop"
  | "about";

export type CloseBehavior = "safe" | "save";

export type AppDefinition = {
  title: string;
  href: string;
  icon: AppIconName;
  minimum: Size;
  size: Size;
  multiple: boolean;
  close: CloseBehavior;
  startMenu: boolean;
};

const documentSize: Size = { width: 960, height: 700 };
const minimum: Size = { width: 420, height: 320 };

function app(
  title: string,
  href: string,
  icon: AppIconName,
  options: Partial<AppDefinition> = {},
): AppDefinition {
  return {
    title,
    href,
    icon,
    minimum,
    size: documentSize,
    multiple: false,
    close: "safe",
    startMenu: true,
    ...options,
  };
}

export const applications = {
  mail: app("Mail", "/webmail/inbox", "mail", { size: { width: 1280, height: 780 } }),
  compose: app("New message", "/webmail/compose", "compose", {
    multiple: true,
    close: "save",
    startMenu: false,
    size: { width: 760, height: 680 },
  }),
  contacts: app("Contacts", "/webmail/contacts", "contacts"),
  services: app("Services", "/webmail/services", "services"),
  aliases: app("Aliases", "/webmail/aliases", "aliases"),
  settings: app("Settings", "/webmail/settings/appearance", "settings"),
  account: app("My account", "/dashboard/overview", "person", {
    size: { width: 1000, height: 760 },
  }),
  domains: app("Domains", "/dashboard/addresses/domains", "domains"),
  security: app("Security", "/dashboard/security", "shield"),
  billing: app("Plus & billing", "/dashboard/billing", "billing"),
  data: app("Your data", "/dashboard/data", "data"),
  appearance: app("Appearance", "/desktop/appearance", "appearance", {
    minimum: { width: 360, height: 280 },
    size: { width: 540, height: 400 },
  }),
  "desktop-settings": app("Desktop settings", "/desktop/settings", "desktop", {
    size: { width: 860, height: 680 },
  }),
  about: app("About VaelMail", "/desktop/about", "about", {
    minimum: { width: 360, height: 300 },
    size: { width: 560, height: 520 },
  }),
} satisfies Record<string, AppDefinition>;

export type AppId = keyof typeof applications;

export type AppLocation = {
  appId: AppId;
  href: string;
  instanceId?: string | undefined;
  title?: string | undefined;
};

export const mailViews = [
  "",
  "inbox",
  "starred",
  "sent",
  "drafts",
  "scheduled",
  "snoozed",
  "archive",
  "spam",
  "trash",
  "all",
  "search",
  "folders",
  "labels",
];

const redirects: Record<string, string> = {
  "/webmail/settings/addresses": "/webmail/aliases",
  "/webmail/settings/storage": "/dashboard/storage",
  "/webmail/settings/session": "/dashboard/security",
};

const dashboardApps: Record<string, AppId> = {
  security: "security",
  billing: "billing",
  data: "data",
};

export function resolveApplication(href: string): AppLocation | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const url = new URL(href, "https://desktop.invalid");
  const trimmed = url.pathname.replace(/\/$/, "") || "/";
  const path = redirects[trimmed] ?? trimmed;
  const target = path + url.search + url.hash;
  const at = (appId: AppId): AppLocation => ({ appId, href: target });
  const [area, section = "", rest = ""] = path.split("/").filter(Boolean);

  if (area === "desktop") {
    if (section === "appearance") return at("appearance");
    if (section === "settings") return at("desktop-settings");
    if (section === "about") return at("about");
    return null;
  }

  if (area === "dashboard") {
    if (section === "addresses" && rest === "domains") return at("domains");
    const dashboardApp = dashboardApps[section];
    if (dashboardApp) return at(dashboardApp);
    return ["", "overview", "storage", "addresses", "checkup"].includes(section)
      ? at("account")
      : null;
  }

  if (area === "webmail") {
    if (section === "compose") return at("compose");
    if (section === "aliases" && rest) return at("mail");
    if (["contacts", "services", "aliases", "settings"].includes(section)) {
      return at(section as AppId);
    }
    return mailViews.includes(section) ? at("mail") : null;
  }

  return null;
}

export function windowIdFor(location: AppLocation): string {
  return location.appId === "compose" && location.instanceId
    ? `compose:${location.instanceId}`
    : location.appId;
}

export const layers = { window: 10, taskbar: 200, menu: 300, modal: 400 } as const;
