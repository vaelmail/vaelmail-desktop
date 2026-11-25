import { account, bootstrap, conversation, inbox } from "./mock-data";

type Args = Record<string, unknown> | undefined;

const frames = new Map<string, string>();

export function mockFrame(id: string): string {
  const html = frames.get(id) ?? "";
  return URL.createObjectURL(new Blob([html], { type: "text/html" }));
}

const desktopSettings = {
  closeToTray: true,
  startHidden: false,
  autostart: false,
  trayUnreadDot: true,
  notifications: { enabled: true, showSender: false, sound: true },
  updates: { auto: true },
  cache: { enabled: true, encryptedMailboxes: false, maxThreads: 200 },
  proxy: { mode: "system", url: "" },
};

function emptyDraft(id: string) {
  return {
    id,
    revision: 1,
    identityId: "i1",
    to: [] as unknown[],
    cc: [] as unknown[],
    bcc: [] as unknown[],
    subject: "",
    html: "",
    editor: null as unknown,
    plain: false,
    attachmentIds: [] as string[],
    threadId: null as string | null,
    quote: "",
    updatedAt: new Date().toISOString(),
  };
}

const drafts = new Map<string, ReturnType<typeof emptyDraft>>();

function respond(status: number, value: unknown) {
  return { status, value };
}

function request(args: Args) {
  const path = String(args?.path ?? "");
  const method = String(args?.method ?? "GET");
  const [route = "", query = ""] = path.split("?");

  if (route === "/api/webmail/settings" && method === "PATCH") {
    Object.assign(bootstrap.mailbox.settings, args?.body);
    return respond(200, bootstrap.mailbox.settings);
  }
  if (route === "/api/webmail/bootstrap") return respond(200, structuredClone(bootstrap));
  if (route === "/api/account" && method === "GET") return respond(200, account);
  if (route === "/api/account/encryption")
    return respond(404, { code: "not_found", message: "not found" });
  if (route === "/api/webmail/mail") {
    const view = new URLSearchParams(query).get("view") ?? "inbox";
    const items =
      view === "starred" ? inbox.filter((entry) => entry.starred) : view === "inbox" ? inbox : [];
    return respond(200, { items, total: items.length, nextCursor: null });
  }
  const thread = /^\/api\/webmail\/threads\/(.+)$/.exec(route);
  if (thread?.[1]) return respond(200, conversation(thread[1]));
  if (route === "/api/webmail/jobs") return respond(200, []);
  if (route === "/api/webmail/services/workspace")
    return respond(200, { services: [], suggestions: [] });
  if (route === "/api/webmail/sync") return respond(200, {});
  if (route === "/api/webmail/drafts" && method === "POST") {
    const draft = emptyDraft("00000000-0000-4000-8000-00000000000" + (drafts.size + 1));
    drafts.set(draft.id, draft);
    return respond(201, draft);
  }
  if (/^\/api\/webmail\/drafts\/[^/]+$/.test(route)) {
    const id = route.split("/").at(-1) ?? "";
    const stored = drafts.get(id) ?? emptyDraft(id);
    if (method === "PATCH") {
      const body = (args?.body ?? {}) as Partial<typeof stored>;
      const next = {
        ...stored,
        ...body,
        id,
        revision: stored.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      drafts.set(id, next);
      return respond(200, next);
    }
    if (method === "DELETE") {
      drafts.delete(id);
      return respond(200, {});
    }
    return respond(200, stored);
  }
  if (/^\/api\/webmail\/drafts\/[^/]+\/files$/.test(route)) return respond(200, []);
  if (route === "/api/account/security-checkup") return respond(200, { items: [] });
  if (route === "/api/account/security-events") return respond(200, { events: [] });
  if (route === "/api/account/passkeys") return respond(200, []);
  if (route === "/api/billing/options")
    return respond(200, { options: [], checkoutEnabled: false });
  if (route === "/api/billing/orders") return respond(200, []);
  if (method !== "GET") return respond(200, {});
  return respond(404, { code: "not_found", message: "not found" });
}

export function mockInvoke(command: string, args: Args): unknown {
  switch (command) {
    case "frontend_error":
      return undefined;
    case "session_status":
      return { signedIn: new URLSearchParams(window.location.search).get("signedOut") !== "1" };
    case "session_passkey_start":
      return { kind: "started", code: "482913", expiresIn: 300 };
    case "session_passkey_poll":
      return { kind: "waiting" };
    case "session_action_passkey_start":
      return { kind: "started", code: "517204", expiresIn: 300 };
    case "session_action_passkey_poll":
      return { kind: "waiting" };
    case "attachment_drag":
      return false;
    case "api_request":
      return request(args);
    case "cache_hydrate":
      return { savedAt: null, entries: [] };
    case "cache_open":
      return false;
    case "cache_size":
      return 0;
    case "desktop_settings_get":
      return desktopSettings;
    case "app_info":
      return {
        version: "0.2.1",
        os: "linux",
        arch: "x86_64",
        webview: "browser",
        cacheSize: 0,
        keychain: true,
        packaged: "installer",
        autostart: true,
        mailHandler: true,
        updates: false,
        dataFolder: null,
      };
    case "notification_permission":
      return "granted";
    case "updates_supported":
      return false;
    case "mailto_take":
      return [];
    case "recovery_list":
      return [];
    case "frame_publish": {
      const id = crypto.randomUUID();
      frames.set(id, String(args?.html ?? ""));
      return { id };
    }
    case "connection_test":
      return { ok: true, status: 200 };
    default:
      return null;
  }
}
