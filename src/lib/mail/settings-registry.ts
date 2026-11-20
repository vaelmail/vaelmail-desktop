type SettingControl = {
  destination?: string;
  section: string;
  title: string;
  description: string;
  synonyms: string;
};
export const settingId = (title: string) =>
  "setting-" +
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-$/, "");
const settingControls: SettingControl[] = (
  [
    ["appearance", "color theme", "dark, light or device appearance", "night day system"],
    ["appearance", "inbox density", "comfortable or compact rows", "spacing size list"],
    ["appearance", "reading pane", "split or full width reading", "desktop layout panels"],
    ["appearance", "message text size", "size of email content", "font typography readability"],
    ["reading", "mark as read on open", "automatically mark opened messages read", "unread"],
    ["reading", "group conversations", "keep replies in one conversation", "threads grouping"],
    ["reading", "default order", "newest or oldest messages first", "sort chronology"],
    [
      "reading",
      "after moving a conversation",
      "where reading continues after an action",
      "next archive trash",
    ],
    [
      "compose",
      "default sending identity",
      "choose the identity for new messages",
      "sender identity from",
    ],
    ["compose", "start in plain text", "choose plain or rich formatting", "editor html toolbar"],
    ["compose", "undo send window", "delay before sending", "cancel seconds"],
    ["compose", "time zone", "mailbox dates", "timezone schedule country city"],
    ["compose", "sending identities", "addresses and signatures", "signature name sender"],
    [
      "notifications",
      "mail activity in the app",
      "queued mail and snoozed mail notifications",
      "in app alert toast mute",
    ],
    ["notifications", "desktop notifications", "browser notification permission", "push alerts"],
    [
      "privacy",
      "website icons",
      "backend favicon fetching or local icons only",
      "favicon logo company brand",
    ],
    [
      "privacy",
      "message images",
      "always block or approve images per message",
      "remote pictures tracking",
    ],
    ["privacy", "message isolation", "sanitized sandboxed content", "html script iframe security"],
    ["privacy", "tracking protection", "external email images are blocked", "pixels privacy"],
    ["organization", "folders", "organize mail into folders", "archive move"],
    ["organization", "labels", "create labels", "tags colors"],
    ["organization", "saved searches", "save a mail query", "filter search"],
    ["rules", "rules", "actions on incoming mail", "automation sender block"],
    ["addresses", "main address", "mailbox receiving address", "account email"],
    ["addresses", "aliases", "manage alias addresses send as alias", "service pause random custom"],
    ["addresses", "custom domains", "custom domain verification", "dns own domain"],
    ["storage", "storage & plan", "usage and mailbox plan", "quota capacity free plus"],
    ["shortcuts", "keyboard shortcuts", "enable mail shortcuts", "keys hotkeys commands"],
    [
      "session",
      "local draft recovery",
      "draft recovery on this device",
      "offline indexeddb copies",
    ],
    ["session", "end demo session", "browser access and illustrative devices", "logout sign out"],
    ["demo", "demo plan", "switch between free and plus", "limits"],
    ["demo", "simulate incoming mail", "create internal demo mail", "receive test code"],
    ["demo", "empty the mailbox", "remove demo mail and drafts", "clear"],
    ["demo", "start again", "restore demo defaults", "reset"],
    ["demo", "export demo mailbox", "download mailbox JSON", "backup data"],
    [
      "security",
      "two-factor authentication",
      "demo authenticator setup and recovery codes",
      "2fa totp account security",
    ],
    ["security", "account key", "rotate your demo account key", "login credential key security"],
    [
      "billing",
      "buy or extend plus",
      "prepaid months and purchase history",
      "payment renewal upgrade expiry receipt",
    ],
    [
      "plugins",
      "strip metadata",
      "remove identifying metadata from outgoing attachments",
      "exif gps author pdf document",
    ],
    [
      "plugins",
      "strip tracking links",
      "remove tracking parameters while reading",
      "utm fbclid gclid url",
    ],
    [
      "plugins",
      "block tracking pixels",
      "keep identifiable tracking images blocked",
      "beacon invisible open",
    ],
    [
      "plugins",
      "warn about suspicious links",
      "check misleading link destinations",
      "phishing domain warning",
    ],
    [
      "plugins",
      "missing attachment reminder",
      "check attachment promises before sending",
      "forgot file attach",
    ],
    [
      "plugins",
      "add tracking pixel",
      "optional open tracking for outgoing messages",
      "seen read receipt sent",
    ],
  ] as [string, string, string, string][]
).map(([section, title, description, synonyms]) => ({
  section,
  title,
  description,
  synonyms,
  destination:
    section === "addresses"
      ? title === "custom domains"
        ? "/dashboard/addresses/domains"
        : "/webmail/aliases"
      : section === "storage"
        ? "/dashboard/storage"
        : section === "session"
          ? title === "local draft recovery"
            ? "/webmail/settings/privacy"
            : "/dashboard/security"
          : section === "security"
            ? "/dashboard/security"
            : section === "billing"
              ? "/dashboard/billing"
              : undefined,
}));
export function searchSettings(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return settingControls.filter((c) =>
    terms.every((term) =>
      (c.title + " " + c.description + " " + c.synonyms).toLowerCase().includes(term),
    ),
  );
}
