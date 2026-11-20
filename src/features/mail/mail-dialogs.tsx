import { toast } from "sonner";
import { FolderSimpleIcon, TagIcon } from "@phosphor-icons/react";
import { useWorkspace } from "@/features/mail/workspace";
import {
  advancedSearchFields,
  joinAdvancedSearch,
  type splitAdvancedSearch,
} from "@/lib/mail/search";
import type { MailAction } from "@/lib/mail/types";
import { Button, Modal } from "@/ui/controls";
import { useMail } from "@/features/mailbox/context";
import { ShortcutHelp } from "./shortcut-help";
export type ActionModalKind = "move" | "label" | "snooze" | "delete";
export type JobModalState = {
  draftId: string;
  id: string;
  state: string;
  rejectedRecipients?: string[];
  recipientResultUnknown?: boolean;
};
export function AdvancedSearchModal({
  open,
  onClose,
  text,
  setText,
  fields,
  setFields,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  setText: (value: string) => void;
  fields: ReturnType<typeof splitAdvancedSearch>["fields"];
  setFields: (
    update: (
      current: ReturnType<typeof splitAdvancedSearch>["fields"],
    ) => ReturnType<typeof splitAdvancedSearch>["fields"],
  ) => void;
  onSearch: (query: string) => void;
}) {
  const { data, request, refresh } = useMail();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="find a little faster"
      description="combine fields with your search. quotes keep phrases together."
    >
      <form
        className="wm-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(joinAdvancedSearch(text, fields));
        }}
      >
        <label>
          words
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {advancedSearchFields.map((key) => (
          <label key={key}>
            {key}
            <input
              type={["before", "after"].includes(key) ? "date" : "text"}
              value={fields[key]}
              onChange={(e) => setFields((s) => ({ ...s, [key]: e.target.value }))}
            />
          </label>
        ))}
        <p className="wm-muted">also try is:unread, has:attachment, label:work or in:archive.</p>
        <div className="wm-modal-actions">
          <Button
            onClick={() => {
              const saved = joinAdvancedSearch(text, fields);
              void request("saved-searches", "POST", {
                name: (saved || "saved search").slice(0, 80),
                query: saved || "is:unread",
                order: data.resources["saved-searches"].length,
              })
                .then(refresh)
                .then(() => toast.success("search saved"))
                .catch((e) => toast.error(e.message));
            }}
          >
            save current search
          </Button>
          <Button type="submit" primary>
            search
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function ShortcutsModal({
  open,
  onClose,
  go,
}: {
  open: boolean;
  onClose: () => void;
  go: (destination: string) => void;
}) {
  const { data } = useMail();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="keyboard shortcuts"
      description={
        data.mailbox.settings.shortcuts
          ? "single keys are paused while you type."
          : "single-key shortcuts are turned off in settings."
      }
    >
      <ShortcutHelp />
      <div className="wm-modal-actions">
        <Button
          onClick={() => {
            onClose();
            go("settings/shortcuts");
          }}
        >
          shortcut settings
        </Button>
        <Button primary onClick={onClose}>
          done
        </Button>
      </div>
    </Modal>
  );
}
export function ActionModal({
  kind,
  onClose,
  busy,
  runAction,
  go,
  snoozeTime,
  setSnoozeTime,
}: {
  kind: ActionModalKind | null;
  onClose: () => void;
  busy: boolean;
  runAction: (type: MailAction["type"], value?: string, ids?: string[]) => Promise<void>;
  go: (destination: string) => void;
  snoozeTime: string;
  setSnoozeTime: (value: string) => void;
}) {
  const { data } = useMail();
  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      title={
        kind === "delete"
          ? "delete permanently?"
          : kind === "snooze"
            ? "give it a little time"
            : kind === "move"
              ? "move to a space"
              : "add a label"
      }
      description={
        kind === "delete" ? "this removes the selected mail and cannot be undone." : undefined
      }
    >
      {kind === "move" || kind === "label" ? (
        <div className="wm-choice-list">
          {data.resources[kind === "move" ? "folders" : "labels"].map((r) => (
            <Button key={r.id} busy={busy} onClick={() => void runAction(kind, r.id)}>
              {kind === "move" ? <FolderSimpleIcon size={18} /> : <TagIcon size={18} />}
              {r.name}
            </Button>
          ))}
          <Button
            onClick={() => {
              onClose();
              go("settings/organization");
            }}
          >
            manage spaces
          </Button>
        </div>
      ) : kind === "snooze" ? (
        <div className="wm-form">
          {[
            ["later today", 3],
            ["tomorrow", 24],
            ["next week", 168],
          ].map(([label, hours]) => (
            <Button
              key={label}
              busy={busy}
              onClick={() =>
                void runAction(
                  "snooze",
                  new Date(Date.now() + Number(hours) * 3600000).toISOString(),
                )
              }
            >
              {label}
            </Button>
          ))}
          <label>
            choose a time
            <input
              type="datetime-local"
              value={snoozeTime}
              onChange={(e) => setSnoozeTime(e.target.value)}
            />
          </label>
          <p className="wm-muted">
            {
              "Times use your device time zone. The server returns snoozed mail even while you are away."
            }
          </p>
          <Button
            primary
            busy={busy}
            disabled={!snoozeTime}
            onClick={() => void runAction("snooze", new Date(snoozeTime).toISOString())}
          >
            snooze
          </Button>
        </div>
      ) : (
        <div className="wm-modal-actions">
          <Button onClick={onClose}>cancel</Button>
          <Button danger busy={busy} onClick={() => void runAction("delete")}>
            delete permanently
          </Button>
        </div>
      )}
    </Modal>
  );
}
export function JobModal({
  job,
  onClose,
  clearSelection,
}: {
  job: JobModalState | null;
  onClose: () => void;
  clearSelection: () => void;
}) {
  const { request, refresh } = useMail();
  return (
    <Modal
      open={!!job}
      onClose={() => {
        onClose();
        clearSelection();
      }}
      title={
        job?.state === "transport-unknown"
          ? "delivery is uncertain"
          : job?.state === "submitting"
            ? "submitting your message"
            : job?.state === "sent-copy-pending"
              ? "saving your Sent copy"
              : job?.state === "sent-partial"
                ? "some recipients were rejected"
                : job?.state === "sent"
                  ? "accepted by the mail relay"
                  : job?.state === "failed"
                    ? "submission was rejected"
                    : job?.state === "blocked"
                      ? "sending is paused"
                      : "your message is queued"
      }
      description={
        job?.state === "transport-unknown"
          ? "The relay acknowledgement was lost. Vael will check for acceptance without sending again. Avoid creating another copy until delivery is resolved."
          : job?.state === "sent-copy-pending"
            ? "The relay accepted your message. Vael is recovering its Sent copy without sending it again. Relay acceptance does not confirm delivery to the recipient."
            : ["sent", "sent-partial"].includes(job?.state || "")
              ? "The relay accepted the message for its accepted recipients. This does not confirm delivery to their inboxes."
              : job?.state === "submitting"
                ? "Wait for the relay acknowledgement. This submission cannot be cancelled."
                : "Cancel sending to edit this draft or choose another time."
      }
    >
      <div className="wm-modal-actions">
        {job?.rejectedRecipients?.length ? (
          <p role="status">Rejected: {job.rejectedRecipients.join(", ")}</p>
        ) : null}
        {job?.recipientResultUnknown ? (
          <p role="status">
            The relay queue confirmed acceptance; individual recipient results are unavailable.
          </p>
        ) : null}
        <Button onClick={onClose}>close</Button>
        <Button
          primary
          disabled={!job || !["queued", "scheduled", "blocked", "failed"].includes(job.state)}
          onClick={() => {
            if (!job) return;
            void request<{
              id: string;
            }>("jobs/" + job.id + "/cancel", "POST", {})
              .then((d) => {
                useWorkspace.getState().openDraft(d.id);
                onClose();
                clearSelection();
                return refresh();
              })
              .catch((e) => toast.error(e.message));
          }}
        >
          cancel & edit
        </Button>
      </div>
    </Modal>
  );
}
