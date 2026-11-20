import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { bootstrap, inbox, conversation } from "@/lib/bridge/mock-data";
import { applySnapshot, type MailboxSnapshot } from "@/features/mailbox/snapshot";
import { defaultFilter, mailOptions, mailScope } from "@/lib/mail/queries";

function client() {
  const instance = new QueryClient();
  instance.setQueryData(["bootstrap"], bootstrap);
  return instance;
}

function snapshot(change: Partial<MailboxSnapshot> = {}): MailboxSnapshot {
  return {
    revision: 1,
    bootstrap: { ...bootstrap, counts: { ...bootstrap.counts, inbox: 9 } },
    inbox: { items: inbox, total: inbox.length, nextCursor: null },
    threads: [],
    queries: [],
    ...change,
  };
}

const inboxKey = mailOptions(
  mailScope("mock-mailbox", 1),
  defaultFilter("inbox", "newest"),
).queryKey;

describe("applySnapshot", () => {
  it("merges the bootstrap and replaces the inbox", () => {
    const queries = client();
    expect(applySnapshot(queries, snapshot())).toBe(true);
    expect(queries.getQueryData<typeof bootstrap>(["bootstrap"])?.counts.inbox).toBe(9);
    expect(queries.getQueryData<{ pages: unknown[] }>(inboxKey)?.pages).toHaveLength(1);
  });

  it("keeps existing resources when a partial snapshot omits them", () => {
    const queries = client();
    const { resources: _omitted, ...withoutResources } = snapshot().bootstrap;
    applySnapshot(queries, snapshot({ bootstrap: withoutResources, partial: true }));
    expect(queries.getQueryData<typeof bootstrap>(["bootstrap"])?.resources.contacts).toHaveLength(
      2,
    );
  });

  it("ignores snapshots for another mailbox generation", () => {
    const queries = client();
    const other = snapshot();
    other.bootstrap = {
      ...other.bootstrap,
      mailbox: { ...other.bootstrap.mailbox, generation: 2 },
    };
    expect(applySnapshot(queries, other)).toBe(false);
    expect(queries.getQueryData<typeof bootstrap>(["bootstrap"])?.counts.inbox).toBe(3);
  });

  it("keeps a scrolled inbox on partial snapshots", () => {
    const queries = client();
    queries.setQueryData(inboxKey, {
      pages: [
        { items: [], total: 0, nextCursor: null },
        { items: [], total: 0, nextCursor: null },
      ],
      pageParams: [undefined, "c"],
    });
    applySnapshot(queries, snapshot({ partial: true }));
    expect(queries.getQueryData<{ pages: unknown[] }>(inboxKey)?.pages).toHaveLength(2);
  });

  it("stores warm conversations under their thread keys", () => {
    const queries = client();
    applySnapshot(queries, snapshot({ threads: [{ id: "t1", conversation: conversation("t1") }] }));
    expect(queries.getQueryData(["thread", "mock-mailbox", 1, "t1"])).toBeDefined();
  });
});
