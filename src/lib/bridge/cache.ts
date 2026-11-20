import { call } from "./invoke";

export type CacheEntry = { key: string; value: unknown; updatedAt: number };

export const cache = {
  open: (mailboxId: string, encrypted: boolean) =>
    call<boolean>("cache_open", { mailboxId, encrypted }),
  hydrate: () => call<{ savedAt: number | null; entries: CacheEntry[] }>("cache_hydrate"),
  write: (entries: Array<{ key: string; value: unknown }>) =>
    call<void>("cache_write", { entries }),
  remove: (keys: string[]) => call<void>("cache_remove", { keys }),
  removePrefix: (prefix: string) => call<void>("cache_remove_prefix", { prefix }),
  clear: () => call<void>("cache_clear"),
  size: () => call<number>("cache_size"),
};
