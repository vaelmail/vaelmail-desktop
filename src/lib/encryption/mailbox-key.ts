const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAILBOX_KEY_LENGTH = 32;
const MAILBOX_KEY_GROUPS = 8;

const MAILBOX_KEY_SEPARATORS =
  /[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF\-\u2010\u2011\u2013\u2014_]/g;

export function normalizeKeyFragment(input: string): string {
  return input
    .replace(MAILBOX_KEY_SEPARATORS, "")
    .replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32))
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

export function normalizeMailboxKey(input: string): string | null {
  const value = normalizeKeyFragment(input);
  if (value.length !== MAILBOX_KEY_LENGTH) return null;
  for (const c of value) if (!ALPHABET.includes(c)) return null;
  return value;
}

export function mailboxKeyGroups(key: string): string[] {
  const normalized = normalizeMailboxKey(key);
  if (!normalized) return [];
  return normalized.match(/.{4}/g) ?? [];
}

export function formatMailboxKey(key: string): string {
  return mailboxKeyGroups(key).join("-");
}

export const CONFIRM_GROUPS = [3, 7] as const;

export function confirmGroupsMatch(key: string, typed: readonly [string, string]): boolean {
  const groups = mailboxKeyGroups(key);
  if (groups.length !== MAILBOX_KEY_GROUPS) return false;
  return CONFIRM_GROUPS.every(
    (group, index) => normalizeKeyFragment(typed[index] ?? "") === groups[group - 1],
  );
}

export function confirmValue(typed: readonly [string, string]): string {
  return typed.map(normalizeKeyFragment).join("-");
}

export function mailboxKeyFile(key: string, address: string): string {
  return [
    "VaelMail mailbox key",
    "",
    "account: " + address,
    "key:     " + formatMailboxKey(key),
    "",
    "This key unlocks your encrypted mailbox and your OpenPGP private key.",
    "VaelMail does not store it and cannot recover it. If you lose it, your",
    "encrypted mail is gone for good and support cannot help.",
    "Keep it somewhere safe and offline, such as a password manager or on paper.",
    "",
  ].join("\n");
}
