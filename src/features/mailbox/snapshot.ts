import type { QueryClient } from "@tanstack/react-query";
import { defaultFilter, mailOptions, mailScope } from "@/lib/mail/queries";
import type { Bootstrap, Conversation, MailList } from "@/lib/mail/types";

export type MailboxSnapshot = {
  revision: number;
  partial?: boolean;
  bootstrap: Omit<Bootstrap, "resources"> & Partial<Pick<Bootstrap, "resources">>;
  inbox: MailList;
  threads: { id: string; conversation: Conversation }[];
  queries: { key: string; value: unknown }[];
  staleQueries?: string[];
};

function observedQueries(client: QueryClient) {
  return new Map(
    client
      .getQueryCache()
      .getAll()
      .filter((query) => query.getObserversCount() > 0)
      .map((query) => [JSON.stringify(query.queryKey), query]),
  );
}

export function applySnapshot(client: QueryClient, snapshot: MailboxSnapshot): boolean {
  const current = client.getQueryData<Bootstrap>(["bootstrap"]);
  if (
    !current ||
    snapshot.bootstrap.mailbox.id !== current.mailbox.id ||
    snapshot.bootstrap.mailbox.generation !== current.mailbox.generation
  ) {
    return false;
  }

  const updated: Bootstrap = {
    ...current,
    ...snapshot.bootstrap,
    resources: snapshot.bootstrap.resources ?? current.resources,
  };
  void client.cancelQueries({ queryKey: ["bootstrap"] });
  client.setQueryData(["bootstrap"], updated);

  for (const { id, conversation } of snapshot.threads) {
    const key = ["thread", current.mailbox.id, current.mailbox.generation, id];
    void client.cancelQueries({ queryKey: key });
    client.setQueryData(key, conversation);
  }

  const inboxKey = mailOptions(
    mailScope(current.mailbox.id, current.mailbox.generation),
    defaultFilter("inbox", "newest"),
  ).queryKey;
  const retained = client.getQueryData<{ pages?: unknown[] }>(inboxKey)?.pages?.length ?? 0;
  if (!snapshot.partial || retained <= 1) {
    void client.cancelQueries({ queryKey: inboxKey });
    client.setQueryData(inboxKey, { pages: [snapshot.inbox], pageParams: [undefined] });
  }

  const stale = snapshot.staleQueries ?? [];
  if (snapshot.queries.length > 0 || stale.length > 0) {
    const observed = observedQueries(client);
    for (const result of snapshot.queries) {
      const query = observed.get(result.key);
      if (!query) continue;
      void client.cancelQueries({ queryKey: query.queryKey, exact: true });
      client.setQueryData(query.queryKey, result.value);
    }
    for (const key of stale) {
      const query = observed.get(key);
      if (query) void client.invalidateQueries({ queryKey: query.queryKey, exact: true });
    }
  }
  return true;
}
