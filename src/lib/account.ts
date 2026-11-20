import type { Plan } from "./mail/types";

export type AccountSecurity = {
  twoFactor: boolean;
  totp?: boolean;
  passkeyCount?: number;
  recoveryHashes: string[];
  keyVersion: number;
  keySuffix: string;
  keyChangedAt: string | null;
  devices: { id: string; name: string; lastActive: string; revoked: boolean }[];
};
export type AccountPurchase = {
  id: string;
  months: 1 | 3 | 6 | 12;
  amount: number;
  outcome: "success" | "declined";
  createdAt: string;
  expiresAt: string | null;
};
type AccountActivity = { id: string; title: string; createdAt: string };
type StorageBreakdown = {
  messages: number;
  drafts: number;
  attachments: number;
  sources: number;
  used: number;
  breakdownAvailable?: boolean;
  attachmentTypes?: Record<string, number>;
};
export type AccountSnapshot = {
  address: string;
  createdAt: string;
  plan: Plan;
  plusExpiresAt: string | null;
  revision: number;
  status: "active";
  storage: StorageBreakdown & { limit: number };
  security: Omit<AccountSecurity, "recoveryHashes"> & { recoveryCount: number };
  sessions: {
    id: string;
    name: string;
    current: boolean;
    simulated: boolean;
    lastActive: string;
    expiresAt: string | null;
  }[];
  purchases: AccountPurchase[];
  activity: AccountActivity[];
};
export type AccountActionResult = {
  ok: true;
  purchase?: AccountPurchase;
  key?: string;
  codes?: string[];
};

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
