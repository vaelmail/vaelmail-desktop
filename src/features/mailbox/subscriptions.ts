import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bridge } from "@/lib/bridge";
import type { SubscriptionQuery } from "@/lib/bridge/realtime";
import { mailPath } from "@/lib/mail/queries";
import type { MailFilter } from "@/lib/mail/types";

const debounceMs = 100;

function describe(key: readonly unknown[], pages: number): SubscriptionQuery | null {
  const id = JSON.stringify(key);
  switch (key[0]) {
    case "mail":
      return { key: id, path: "/api/webmail/" + mailPath(key[3] as MailFilter), pages };
    case "thread":
      return typeof key[3] === "string"
        ? { key: id, path: "/api/webmail/threads/" + key[3] }
        : null;
    case "account":
      return { key: id, path: "/api/account" };
    case "services":
      return { key: id, path: "/api/webmail/services/workspace" };
    case "jobs":
      return { key: id, path: "/api/webmail/jobs" };
    default:
      return null;
  }
}

export function useMailSubscriptions(enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = () => {
      const queries = client
        .getQueryCache()
        .getAll()
        .filter((query) => query.getObserversCount() > 0)
        .flatMap((query) => {
          const loaded = (query.state.data as { pages?: unknown[] } | undefined)?.pages?.length;
          const entry = describe(query.queryKey, Math.max(1, loaded ?? 1));
          return entry ? [entry] : [];
        });
      void bridge.realtime.subscribe(queries);
    };

    const unwatch = client.getQueryCache().subscribe((event) => {
      if (!["observerAdded", "observerRemoved", "updated"].includes(event.type)) return;
      clearTimeout(timer);
      timer = setTimeout(publish, debounceMs);
    });
    publish();
    return () => {
      unwatch();
      clearTimeout(timer);
    };
  }, [client, enabled]);
}
