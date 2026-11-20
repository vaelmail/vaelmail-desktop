import { createContext, useContext } from "react";
import type { Bootstrap, Draft, Settings } from "@/lib/mail/types";
import type { SaveSnapshot } from "@/lib/mail/settings-writer";

export type MailContextValue = {
  data: Bootstrap;
  refreshing: boolean;
  lastSync: number | null;
  refresh: () => Promise<void>;
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  compose: (initial?: Partial<Draft>) => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  settingsSave: SaveSnapshot;
  retrySettings: () => Promise<void>;
};

export const MailContext = createContext<MailContextValue | null>(null);

export function useMail(): MailContextValue {
  const value = useContext(MailContext);
  if (!value) throw new Error("missing mailbox");
  return value;
}

export function useOptionalMail(): MailContextValue | null {
  return useContext(MailContext);
}
