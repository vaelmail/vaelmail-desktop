import type { Query, QueryClient } from "@tanstack/react-query";
import { bridge } from "@/lib/bridge";

const flushDelay = 1000;
const persistedViews = new Set(["inbox", "sent", "drafts", "starred"]);
const persistedKeys = new Set(["bootstrap", "account", "services", "thread", "mail"]);
const retainedPages = 2;

function serialisable(query: Query): { key: string; value: unknown } | null {
  const [kind] = query.queryKey;
  if (typeof kind !== "string" || !persistedKeys.has(kind)) return null;
  if (query.state.status !== "success" || query.state.data === undefined) return null;
  if (kind === "mail") {
    const filter = query.queryKey[3] as { view?: string; query?: string } | undefined;
    if (!filter?.view || !persistedViews.has(filter.view) || filter.query) return null;
    const data = query.state.data as { pages: unknown[]; pageParams: unknown[] };
    return {
      key: JSON.stringify(query.queryKey),
      value: {
        pages: data.pages.slice(0, retainedPages),
        pageParams: data.pageParams.slice(0, retainedPages),
      },
    };
  }
  return { key: JSON.stringify(query.queryKey), value: query.state.data };
}

export async function hydrate(client: QueryClient): Promise<boolean> {
  try {
    const { entries } = await bridge.cache.hydrate();
    for (const entry of entries) {
      const key = JSON.parse(entry.key) as unknown[];
      client.setQueryData(key, entry.value, { updatedAt: entry.updatedAt });
    }
    return entries.some((entry) => entry.key === '["bootstrap"]');
  } catch {
    return false;
  }
}

export function startPersistence(client: QueryClient): () => void {
  const pending = new Map<string, unknown>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    if (pending.size === 0) return;
    const entries = [...pending].map(([key, value]) => ({ key, value }));
    pending.clear();
    void bridge.cache.write(entries).catch(() => undefined);
  };

  const unwatch = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const entry = serialisable(event.query);
    if (!entry) return;
    pending.set(entry.key, entry.value);
    timer ??= setTimeout(flush, flushDelay);
  });

  return () => {
    unwatch();
    clearTimeout(timer);
    flush();
  };
}
