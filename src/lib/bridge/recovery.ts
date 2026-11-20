import type { Draft } from "@/lib/mail/types";
import { call } from "./invoke";

export type RecoveryRecord = {
  key: string;
  mailboxId: string;
  generation: number;
  draft: Draft;
  savedAt: number;
};

export const recovery = {
  put: (record: RecoveryRecord) => call<void>("recovery_put", { record }),
  list: (mailboxId: string) => call<RecoveryRecord[]>("recovery_list", { mailboxId }),
  remove: (key: string) => call<void>("recovery_remove", { key }),
  clear: () => call<void>("recovery_clear"),
};
