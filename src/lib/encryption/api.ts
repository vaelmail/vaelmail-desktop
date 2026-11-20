import { api, apiBytes, ApiError } from "@/lib/bridge";
import { recovery } from "@/lib/bridge/recovery";
import { markMailboxLocked, markMailboxUnlocked } from "@/lib/encryption/lock-state";

type EncryptionState = "off" | "migrating" | "enabled" | "disabling";
const states: readonly EncryptionState[] = ["off", "migrating", "enabled", "disabling"];
export type EncryptionStatus = {
  state: EncryptionState;
  unlocked: boolean;
  unlockRequired: boolean;
  migrate: { total: number; done: number; error?: string | null };
  pgp?: { fingerprint: string; publicKey: string } | null;
  backupRetentionDays?: number;
  imapClients?: number;
};

export function backupRetention(status?: { backupRetentionDays?: number } | null) {
  const days = Number(status?.backupRetentionDays);
  return Number.isInteger(days) && days > 0 && days < 1000 ? days : 7;
}

type Reauth = { accountKey: string; factor: string };

export type BeginResult = {
  key: string;
  grant: string;
  pgpPassphrase?: string;
};
export type PgpKeyUpload = {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
};
export type ChangeKeyBegin = {
  key: string;
  grant: string;
  pgpPassphrase?: string;
};
type PgpSecret = {
  passphrase: string;
  privateKey?: string;
};
type KeyLookup = {
  found: boolean;
  source?: "vael" | "wkd" | "contact";
  publicKey?: string;
  fingerprint?: string;
};
export type ContactKey = {
  id: string;
  email: string;
  fingerprint: string;
  createdAt?: string;
};
export type SecurityEvent = {
  id?: string;
  kind: string;
  createdAt: string;
  data?: Record<string, unknown> | null;
};
export type CheckupItem = {
  id: string;
  status: "ok" | "warn" | "todo";
  title: string;
  detail: string;
  action?: { label: string; href: string } | null;
};

const base = "/api/account/encryption";

export async function encryptionStatus(signal?: AbortSignal): Promise<EncryptionStatus | null> {
  try {
    const value = await api<unknown>(base, "GET", undefined, undefined, signal);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const status = value as Partial<EncryptionStatus>;
    if (!states.includes(status.state as EncryptionState)) return null;
    return {
      ...status,
      migrate: { total: 0, done: 0, ...(status.migrate || {}) },
    } as EncryptionStatus;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

async function reauthenticated<T>(
  path: string,
  reauth: Reauth,
  extra: Record<string, unknown>,
): Promise<T> {
  const body: Record<string, unknown> = {
    accountKey: reauth.accountKey,
    ...extra,
  };
  return api<T>(path, "POST", {
    ...body,
    ...(reauth.factor ? { factor: reauth.factor } : {}),
  });
}

export function beginEncryption(reauth: Reauth) {
  return reauthenticated<BeginResult>(base + "/begin", reauth, { pgp: true });
}

export async function enableEncryption(input: {
  grant: string;
  confirm: string;
  pgp?: PgpKeyUpload;
}) {
  const result = await api<{ state: EncryptionState }>(base + "/enable", "POST", {
    grant: input.grant,
    confirm: input.confirm,
    saved: true,
    ...(input.pgp ? { pgp: input.pgp } : {}),
  });
  markMailboxUnlocked();
  return result;
}

export async function unlockMailbox(normalizedKey: string) {
  const result = await api<{ unlocked: boolean }>(base + "/unlock", "POST", {
    key: normalizedKey,
  });
  markMailboxUnlocked();
  return result;
}

export async function lockMailbox() {
  await api(base + "/lock", "POST", {});
  markMailboxLocked();
  await recovery.clear().catch(() => undefined);
}

export function beginChangeKey(reauth: Reauth, currentKey: string) {
  return reauthenticated<ChangeKeyBegin>(base + "/change-key", reauth, {
    key: currentKey,
  });
}

export function commitChangeKey(input: { grant: string; confirm: string; privateKey?: string }) {
  return api<{
    state?: EncryptionState;
    unlocked?: boolean;
    oldKeyNote?: string;
  }>(base + "/change-key", "POST", {
    grant: input.grant,
    confirm: input.confirm,
    saved: true,
    ...(input.privateKey ? { pgp: { privateKey: input.privateKey } } : {}),
  });
}

export const DISABLE_PHRASE = "turn off encryption";

export function disablePhraseMatches(typed: string) {
  return typed.trim().toLowerCase().split(/\s+/).join(" ") === DISABLE_PHRASE;
}

export async function disableEncryption(
  reauth: Reauth,
  normalizedKey: string,
  confirm: string,
  options: { cancel?: boolean } = {},
) {
  const result = await reauthenticated<{ state: EncryptionState }>(base + "/disable", reauth, {
    key: normalizedKey,
    confirm,
    ...(options.cancel ? { cancel: true } : {}),
  });
  markMailboxUnlocked();
  return result;
}

export function pgpSecret(signal?: AbortSignal) {
  return api<PgpSecret>(base + "/pgp-secret", "GET", undefined, undefined, signal);
}

export function exportPrivateKey(normalizedKey: string) {
  return api<{ armored: string; fingerprint: string; filename: string }>(
    base + "/pgp-export",
    "POST",
    { key: normalizedKey },
  );
}

export function publicKeyArmor(signal?: AbortSignal) {
  return api<{ armored: string; fingerprint: string }>(
    base + "/pgp-public",
    "GET",
    undefined,
    undefined,
    signal,
  );
}

export function lookupKey(email: string, signal?: AbortSignal) {
  return api<KeyLookup>(
    "/api/keys/lookup?email=" + encodeURIComponent(email),
    "GET",
    undefined,
    undefined,
    signal,
  );
}

export async function listContactKeys(signal?: AbortSignal) {
  const value = await api<ContactKey[] | { keys: ContactKey[] }>(
    "/api/keys/contacts",
    "GET",
    undefined,
    undefined,
    signal,
  );
  return Array.isArray(value) ? value : value.keys || [];
}

export function addContactKey(publicKey: string) {
  return api<ContactKey>("/api/keys/contacts", "POST", { publicKey });
}

export function deleteContactKey(id: string) {
  return api("/api/keys/contacts/" + encodeURIComponent(id), "DELETE");
}

export async function securityEvents(signal?: AbortSignal) {
  const value = await api<SecurityEvent[] | { events: SecurityEvent[] }>(
    "/api/account/security-events",
    "GET",
    undefined,
    undefined,
    signal,
  );
  const list = Array.isArray(value) ? value : value?.events;
  return (Array.isArray(list) ? list : []).filter(
    (e): e is SecurityEvent =>
      !!e && typeof e === "object" && typeof e.kind === "string" && typeof e.createdAt === "string",
  );
}

export async function securityCheckup(signal?: AbortSignal) {
  const value = await api<{ items: CheckupItem[] }>(
    "/api/account/security-checkup",
    "GET",
    undefined,
    undefined,
    signal,
  );
  const items =
    value && typeof value === "object" && !Array.isArray(value) ? value.items : undefined;
  return (Array.isArray(items) ? items : []).filter(
    (i): i is CheckupItem =>
      !!i && typeof i === "object" && typeof i.id === "string" && typeof i.title === "string",
  );
}

export async function panicLock() {
  const result = await api<{ done: boolean }>("/api/account/panic", "POST", {});
  markMailboxLocked();
  await recovery.clear().catch(() => undefined);
  return result;
}

export function encryptedDraftField(mime: string) {
  return { pgp: { mime } };
}

export async function messageSource(id: string) {
  const bytes = await apiBytes("/api/webmail/messages/" + encodeURIComponent(id) + "/source");
  return new Uint8Array(bytes);
}

export async function attachmentBytes(id: string) {
  const bytes = await apiBytes("/api/webmail/attachments/" + encodeURIComponent(id));
  return new Uint8Array(bytes);
}
