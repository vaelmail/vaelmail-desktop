import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, BridgeError, bridge } from "@/lib/bridge";
import type { RecoveryRecord } from "@/lib/bridge/recovery";
import type { Draft, Job, SendPreparation } from "@/lib/mail/types";
import { useWorkspace } from "@/features/mail/workspace";
import { useMail } from "./context";

const marker = ":outbox:";
const retryDelay = 30_000;

export const outboxKey = (mailboxId: string, draftId: string) => `${mailboxId}${marker}${draftId}`;

export function queueSend(mailboxId: string, generation: number, draft: Draft) {
  return bridge.recovery.put({
    key: outboxKey(mailboxId, draft.id),
    mailboxId,
    generation,
    draft,
    savedAt: Date.now(),
  });
}

export function offline(error: unknown) {
  return error instanceof BridgeError && error.failure.kind === "offline";
}

export function useNetworkOnline() {
  return useSyncExternalStore(
    useCallback((callback) => onlineManager.subscribe(callback), []),
    () => onlineManager.isOnline(),
    () => true,
  );
}

function draftBody(draft: Draft) {
  const { id: _id, updatedAt: _updatedAt, ...body } = draft;
  return { ...body, pgp: null };
}

type Outcome = "sent" | "review" | "later";

export function OutboxRunner() {
  const { data, request, refresh } = useMail();
  const online = useNetworkOnline();
  const running = useRef(false);
  const mailboxId = data.mailbox.id;
  const generation = data.mailbox.generation;

  const deliver = useCallback(
    async (record: RecoveryRecord): Promise<Outcome> => {
      const { draft } = record;
      try {
        const saved = await request<Draft>("drafts/" + draft.id, "PATCH", draftBody(draft));
        const preparation = await request<SendPreparation>(
          "drafts/" + draft.id + "/prepare-send",
          "POST",
          { revision: saved.revision },
        );
        if (preparation.files.some((file) => file.status === "original-required")) return "review";
        await request<Job>("drafts/" + draft.id + "/send", "POST", {
          key: record.key,
          revision: saved.revision,
          preparationId: preparation.id,
          originalApprovals: [],
        });
        return "sent";
      } catch (error) {
        if (offline(error)) return "later";
        if (error instanceof ApiError && error.status >= 500) return "later";
        return "review";
      }
    },
    [request],
  );

  const flush = useCallback(async () => {
    if (running.current || !onlineManager.isOnline()) return;
    running.current = true;
    try {
      const records = await bridge.recovery.list(mailboxId);
      const queued = records.filter(
        (record) => record.key.includes(marker) && record.generation === generation,
      );
      let sent = 0;
      for (const record of queued) {
        const outcome = await deliver(record);
        if (outcome === "later") break;
        await bridge.recovery.remove(record.key);
        if (outcome === "sent") {
          sent += 1;
          continue;
        }
        useWorkspace.getState().openDraft(record.draft.id);
        toast.error(
          `"${record.draft.subject || "(no subject)"}" couldn't be sent automatically. check it and send again.`,
        );
      }
      if (sent) {
        toast.success(sent === 1 ? "your queued message was sent" : `${sent} queued messages sent`);
        await refresh();
      }
    } finally {
      running.current = false;
    }
  }, [deliver, generation, mailboxId, refresh]);

  useEffect(() => {
    if (!online) return;
    void flush();
    const timer = window.setInterval(() => void flush(), retryDelay);
    return () => window.clearInterval(timer);
  }, [online, flush]);

  return null;
}
