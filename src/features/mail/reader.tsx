import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "@/ui/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useNextTheme as useTheme } from "@/lib/theme";
import { mailDate } from "@/lib/mail/date";
import { replySubject } from "@/lib/mail/reply-subject";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowBendUpLeftIcon,
  ArrowBendUpRightIcon,
  ArchiveIcon,
  ClockIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  StarIcon,
  TrashIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { download } from "@/lib/mail/client";
import {
  formatBytes,
  type Attachment,
  type MailAction,
  type Message,
  type Recipient,
} from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import { mailScope, threadOptions } from "@/lib/mail/queries";
import { SenderIcon } from "./sender-icon";
import { AuthenticityBadge } from "./authenticity";
import { MessageContent } from "./message-content";
import { detectPgp } from "@/lib/encryption/pgp-mime";
import { CodeCopy } from "./code-copy";
import { Button, Dropdown, Failure, IconButton, Modal, Skeleton } from "@/ui/controls";
import { bridge } from "@/lib/bridge";

const attachmentPath = (id: string) => "/api/webmail/attachments/" + id;

function stageAttachment(id: string, name: string) {
  void bridge.files.stageAttachment(attachmentPath(id), name).catch(() => undefined);
}

function dragAttachment(id: string, name: string) {
  void bridge.files.dragAttachment(attachmentPath(id), name).catch(() => {
    toast.error("the attachment could not be dragged. use download instead.");
  });
}
const AttachmentPreview = dynamic(
  () => import("./attachment-preview").then((m) => m.AttachmentPreview),
  { ssr: false, loading: () => <p role="status">opening attachment…</p> },
);
const PgpMessage = dynamic(() => import("./pgp-message").then((m) => m.PgpMessage), {
  ssr: false,
  loading: () => <p role="status">opening encrypted message…</p>,
});
export type ReaderCommands = {
  reply: () => void;
  replyAll: () => void;
  forward: () => void;
};
export function Reader({
  id,
  back,
  action,
  organize,
  onCommands,
  active = true,
}: {
  id: string;
  back: () => void;
  action: (type: MailAction["type"], value?: string, ids?: string[]) => Promise<void>;
  organize: (type: "move" | "label" | "snooze" | "delete") => void;
  onCommands?: (commands: ReaderCommands | null) => void;
  active?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const { data, request, compose, refresh } = useMail(),
    [headers, setHeaders] = useState<Message | null>(null),
    [expanded, setExpanded] = useState<string[]>([]),
    [preview, setPreview] = useState<Attachment | null>(null);
  const q = useQuery({
    ...threadOptions(mailScope(data.mailbox.id, data.mailbox.generation), id),
    enabled: active,
  });
  const marked = useRef(new Set<string>());
  useEffect(() => {
    const messages = q.data?.messages;
    if (!active || !messages || !data.mailbox.settings.markRead) return;
    const fresh = messages.filter(
      (m) => m.direction === "incoming" && !m.read && !marked.current.has(m.id),
    );
    for (const m of messages) marked.current.add(m.id);
    if (!fresh.length) return;
    void request("actions", "POST", { type: "read", ids: [id] })
      .then(refresh)
      .catch(() => {
        for (const m of fresh) marked.current.delete(m.id);
      });
  }, [q.data, id, data.mailbox.settings.markRead, request, refresh, active]);
  const reply = useCallback(
    (message: Message, mode: "reply" | "all" | "forward") => {
      const own = new Set([
        data.mailbox.address,
        ...data.resources.identities.map((i) => i.email),
        ...data.resources.aliases.map((a) => a.address),
      ]);
      const recipients =
        mode === "forward"
          ? []
          : message.direction === "outgoing"
            ? message.to
            : [message.replyTo || message.from];
      const dedupe = (list: Recipient[]) =>
        list.filter(
          (r, i) => !own.has(r.email) && list.findIndex((x) => x.email === r.email) === i,
        );
      const addressed = new Set(
        (message.direction === "outgoing" ? [message.from] : [...message.to, ...message.cc]).map(
          (r) => r.email.toLowerCase(),
        ),
      );
      const identity =
        (mode === "forward"
          ? undefined
          : data.resources.identities.find((i) => addressed.has(i.email.toLowerCase()))) ||
        data.resources.identities.find((i) => i.id === data.mailbox.settings.defaultIdentity) ||
        data.resources.identities[0];
      void compose({
        to: dedupe(mode === "all" ? [...recipients, ...message.to] : recipients),
        cc:
          mode === "all"
            ? dedupe(message.cc).filter((r) => !recipients.some((x) => x.email === r.email))
            : [],
        subject: replySubject(message.subject, mode),
        threadId: mode === "forward" ? null : id,
        replyToMessageId: mode === "forward" ? null : message.id,
        quote: detectPgp({ contentType: message.mime?.contentType, text: message.text })
          ? ""
          : "<blockquote><p>" +
            mailDate(message.createdAt, "PPp", data.mailbox.timezone) +
            ", " +
            message.from.email.replace(/[<&]/g, "") +
            "</p>" +
            message.html +
            "</blockquote>",
        html: "<p></p>" + (identity?.signature || ""),
        ...(identity ? { identityId: identity.id } : {}),
        attachmentIds: mode === "forward" ? message.attachmentIds : [],
      });
    },
    [data, compose, id],
  );
  useEffect(() => {
    const latest = q.data?.messages.at(-1);
    onCommands?.(
      latest
        ? {
            reply: () => reply(latest, "reply"),
            replyAll: () => reply(latest, "all"),
            forward: () => reply(latest, "forward"),
          }
        : null,
    );
    return () => onCommands?.(null);
  }, [q.data, reply, onCommands]);
  if (q.isPending)
    return (
      <section className="wm-reader">
        <Skeleton variant="reader" />
      </section>
    );
  if (q.error)
    return (
      <section className="wm-reader">
        <IconButton label="back to messages" onClick={back}>
          <ArrowLeftIcon size={19} />
        </IconButton>
        <Failure error={q.error} retry={() => void q.refetch()} />
      </section>
    );
  const c = q.data,
    latest = c.messages.at(-1)!;
  const run = (type: MailAction["type"]) => void action(type, undefined, [id]);
  return (
    <section className="wm-reader" aria-label="conversation">
      <div className="wm-reader-toolbar">
        <div className="wm-row">
          <IconButton label="back to messages" onClick={back}>
            <ArrowLeftIcon size={19} />
          </IconButton>
          <span className="wm-toolbar-divider" />
          <IconButton label="archive conversation" onClick={() => run("archive")}>
            <ArchiveIcon size={19} />
          </IconButton>
          <IconButton label="trash conversation" onClick={() => run("trash")}>
            <TrashIcon size={19} />
          </IconButton>
          <IconButton label="snooze conversation" onClick={() => organize("snooze")}>
            <ClockIcon size={19} />
          </IconButton>
        </div>
        <div className="wm-row">
          <IconButton
            label={c.starred ? "unstar conversation" : "star conversation"}
            className={c.starred ? "starred" : ""}
            onClick={() => run(c.starred ? "unstar" : "star")}
          >
            <StarIcon size={19} weight={c.starred ? "fill" : "regular"} />
          </IconButton>
          <Dropdown
            label="conversation actions"
            items={[
              { label: "mark unread", action: () => run("unread") },
              { label: "move to folder", action: () => organize("move") },
              { label: "add label", action: () => organize("label") },
              ...c.labelIds.map((labelId) => ({
                label:
                  "remove " +
                  (data.resources.labels.find((l) => l.id === labelId)?.name || "label"),
                action: () => void action("unlabel", labelId, [id]),
              })),
              {
                label: "unsnooze",
                action: () => run("unsnooze"),
                disabled: !c.snoozedUntil,
              },
              { label: "restore to inbox", action: () => run("restore") },
              { label: "mark as spam", action: () => run("spam") },
              {
                label: "block sender with a rule",
                action: () => {
                  void request("rules", "POST", {
                    name: "block " + latest.from.email,
                    enabled: true,
                    match: "all",
                    conditions: [{ field: "from", value: latest.from.email }],
                    actions: [{ type: "spam", value: "" }],
                    order: data.resources.rules.length,
                  })
                    .then(() => {
                      toast.success("sender blocked for future incoming mail");
                      run("spam");
                    })
                    .catch((e) => toast.error(e.message));
                },
              },
              { label: "print conversation", action: () => window.print() },
              {
                label: "delete permanently",
                action: () => organize("delete"),
                danger: true,
                disabled: !c.messages.every((m) => ["trash", "spam"].includes(m.folder)),
              },
            ]}
          >
            <DotsThreeIcon size={22} />
          </Dropdown>
        </div>
      </div>
      <div className="wm-reader-scroll">
        <div className="wm-subject-heading">
          <h1>{c.subject || "(no subject)"}</h1>
          <div className="wm-reader-labels">
            {c.labelIds.map((id) => {
              const l = data.resources.labels.find((l) => l.id === id);
              return (
                l && (
                  <span key={id} className={"wm-label " + l.color}>
                    {l.name}
                  </span>
                )
              );
            })}
            {c.snoozedUntil && (
              <span className="wm-label">
                snoozed until {mailDate(c.snoozedUntil, "PPp", data.mailbox.timezone)}
              </span>
            )}
          </div>
        </div>
        {c.messages.map((m, index) => {
          const collapsed = index < c.messages.length - 1 && !expanded.includes(m.id);
          return (
            <article className={"wm-message " + (collapsed ? "collapsed" : "")} key={m.id}>
              <div className="wm-message-heading">
                <SenderIcon sender={m.from} messageId={m.id} />
                <button
                  type="button"
                  className="wm-sender"
                  onClick={() =>
                    setExpanded((s) =>
                      s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id],
                    )
                  }
                  aria-expanded={!collapsed}
                >
                  <strong>{m.from.name || m.from.email}</strong>
                  <span>{m.from.email}</span>
                  {!collapsed && (
                    <span className="wm-delivered">
                      {m.direction === "outgoing" ? "sent to " : "received at "}
                      {m.deliveredTo || m.to.map((r) => r.email).join(", ")}
                    </span>
                  )}
                </button>
                <time dateTime={m.createdAt}>
                  {mailDate(m.createdAt, "MMM d, HH:mm", data.mailbox.timezone)}
                </time>
                <Dropdown
                  label="message options"
                  items={[
                    { label: "message details", action: () => setHeaders(m) },
                    { label: "reply", action: () => reply(m, "reply") },
                    { label: "reply all", action: () => reply(m, "all") },
                    { label: "forward", action: () => reply(m, "forward") },
                    {
                      label: "download .eml",
                      action: () => {
                        download("/api/webmail/messages/" + m.id + "/source", "message.eml");
                      },
                    },
                    {
                      label: "add sender to contacts",
                      action: () => {
                        void request("contacts", "POST", {
                          name: m.from.name || "",
                          emails: [m.from.email],
                          notes: "",
                          favorite: false,
                          order: data.resources.contacts.length,
                        })
                          .then(() => toast.success("contact saved"))
                          .catch((e) => toast.error(e.message));
                      },
                    },
                  ]}
                >
                  <DotsThreeIcon size={20} />
                </Dropdown>
              </div>
              {!collapsed && (
                <>
                  <div
                    className="wm-message-body"
                    style={{ fontSize: data.mailbox.settings.bodySize }}
                  >
                    <AuthenticityBadge authenticity={m.authenticity} />
                    {m.relayAcceptance && (
                      <div role="status" className="wm-muted">
                        <p>
                          Accepted by the mail relay. This does not confirm delivery to
                          recipients&#39; inboxes.
                        </p>
                        {m.relayAcceptance.rejectedRecipients.length > 0 && (
                          <p>
                            Rejected recipients: {m.relayAcceptance.rejectedRecipients.join(", ")}
                          </p>
                        )}
                        {m.relayAcceptance.recipientResultUnknown && (
                          <p>Individual recipient acceptance results are unavailable.</p>
                        )}
                      </div>
                    )}
                    {m.detectedCode && m.detectedCode.messageId === m.id && (
                      <CodeCopy code={m.detectedCode} />
                    )}
                    {detectPgp({
                      contentType: m.mime?.contentType,
                      text: m.text,
                    }) ? (
                      <PgpMessage
                        key={data.mailbox.id + data.mailbox.generation + m.id}
                        message={m}
                        index={index}
                        light={resolvedTheme === "light"}
                      />
                    ) : (
                      <MessageContent
                        key={
                          data.mailbox.id +
                          data.mailbox.generation +
                          id +
                          m.id +
                          (m.imageVersion || "") +
                          data.mailbox.settings.images +
                          data.mailbox.settings.blockTrackingPixels +
                          data.mailbox.settings.stripTrackingLinks +
                          data.mailbox.settings.warnSuspiciousLinks
                        }
                        message={m}
                        index={index}
                        light={resolvedTheme === "light"}
                      />
                    )}
                  </div>
                  {m.attachmentIds.length > 0 && (
                    <div className="wm-attachments">
                      {c.attachments
                        .filter((f) => m.attachmentIds.includes(f.id))
                        .map((f) => (
                          <button
                            type="button"
                            key={f.id}
                            onClick={() => setPreview(f)}
                            className="wm-file"
                            draggable
                            title="click to preview, drag to save it somewhere"
                            onPointerDown={() => stageAttachment(f.id, f.name)}
                            onDragStart={(event) => {
                              event.preventDefault();
                              dragAttachment(f.id, f.name);
                            }}
                          >
                            <span>
                              <strong>{f.name}</strong>
                              <small>
                                {formatBytes(f.bytes)} · {f.type.split("/")[1]}
                              </small>
                            </span>
                            <DownloadSimpleIcon size={18} />
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
        <div className="wm-reply-actions">
          <Button onClick={() => reply(latest, "reply")}>
            <ArrowBendUpLeftIcon size={18} />
            reply
          </Button>
          <Button onClick={() => reply(latest, "all")}>
            <UsersIcon size={18} />
            reply all
          </Button>
          <Button onClick={() => reply(latest, "forward")}>
            <ArrowBendUpRightIcon size={18} />
            forward
          </Button>
        </div>
      </div>
      <Modal open={!!headers} onClose={() => setHeaders(null)} title="message details">
        {headers && (
          <dl className="wm-details">
            {Object.entries({
              from: headers.from.email,
              to: headers.to.map((r) => r.email).join(", "),
              cc: headers.cc.map((r) => r.email).join(", ") || "none",
              "delivered to": headers.deliveredTo,
              date: mailDate(headers.createdAt, "PPpp", data.mailbox.timezone),
              subject: headers.subject,
              "message id": headers.mime?.messageId || "not provided",
              "content type": headers.mime?.contentType || "text/html; charset=utf-8",
              authentication: headers.mime?.imported
                ? "unverified imported email"
                : "see authentication headers in the original message",
            }).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
      <Modal
        wide
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name || "attachment"}
        description={preview ? formatBytes(preview.bytes) : undefined}
      >
        {preview && (
          <div className="wm-preview">
            <AttachmentPreview key={preview.id} file={preview} />
            <a
              className="wm-button primary"
              href={"/api/webmail/attachments/" + preview.id}
              download
            >
              download <DownloadSimpleIcon size={17} />
            </a>
          </div>
        )}
      </Modal>
    </section>
  );
}
