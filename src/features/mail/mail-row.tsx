import {
  ClockIcon,
  LockSimpleIcon,
  PaperclipIcon,
  StarIcon,
  DotsThreeIcon,
} from "@phosphor-icons/react";
import { mailDate } from "@/lib/mail/date";
import type { MailItem } from "@/lib/mail/types";
import { SenderIcon } from "./sender-icon";
import { ContextMenu } from "@base-ui/react/context-menu";
import type { MenuEntry } from "@/ui/controls";
import { IconButton, Dropdown } from "@/ui/controls";
import { CodeCopy } from "./code-copy";
import { TrackingBadge } from "./tracking";
import { openUnlockPrompt } from "@/lib/encryption/lock-state";

export function MailRow({
  item,
  active,
  selected,
  timezone,
  onSelect,
  onOpen,
  onStar,
  actions,
  targetCount,
}: {
  actions: MenuEntry[];
  targetCount: number;
  item: MailItem;
  active: boolean;
  selected: boolean;
  timezone: string;
  onSelect: (selected: boolean, range: boolean) => void;
  onOpen: () => void;
  onStar: () => void;
}) {
  const date = item.dueAt || item.createdAt;
  const today =
    mailDate(date, "yyyy-MM-dd", timezone) ===
    mailDate(new Date().toISOString(), "yyyy-MM-dd", timezone);
  return (
    <ContextMenu.Root
      onOpenChange={(open, details) => {
        if (open && !item.threadId) details.cancel();
      }}
    >
      <>
        <ContextMenu.Trigger
          render={<div />}
          draggable={!!item.threadId}
          onDragStart={(event) => {
            if (!item.threadId) return;
            event.dataTransfer.setData("application/x-vael-thread", item.threadId);
            event.dataTransfer.effectAllowed = "move";
          }}
          className={[
            "wm-mail-row",
            item.unread && "unread",
            active && "active",
            selected && "selected",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {item.threadId && (
            <div className="wm-row-side">
              <input
                type="checkbox"
                aria-label={"select " + (item.locked ? "encrypted message" : item.subject)}
                checked={selected}
                onChange={(event) =>
                  onSelect(
                    event.target.checked,
                    "shiftKey" in event.nativeEvent && (event.nativeEvent as MouseEvent).shiftKey,
                  )
                }
              />
            </div>
          )}
          <button
            type="button"
            className="wm-mail-hit"
            aria-current={active ? "true" : undefined}
            onClick={item.locked ? openUnlockPrompt : onOpen}
          >
            {item.locked ? (
              <span className="wm-locked-icon" aria-hidden>
                <LockSimpleIcon size={16} />
              </span>
            ) : (
              <SenderIcon sender={item.sender} messageId={item.messageId} />
            )}
            <span className="wm-mail-copy">
              <span className="wm-mail-top">
                <span
                  className="wm-mail-sender"
                  title={item.locked ? undefined : item.sender.email}
                >
                  {item.locked ? "encrypted" : item.sender.name || item.sender.email || "draft"}
                  {item.messageCount > 1 && (
                    <small aria-label={item.messageCount + " messages"}>{item.messageCount}</small>
                  )}
                </span>
                {item.unread && <span className="wm-unread-dot" aria-label="unread" />}
                <time dateTime={date} title={mailDate(date, "PPpp", timezone)}>
                  {mailDate(date, today ? "HH:mm" : "MMM d", timezone)}
                </time>
              </span>
              <span className="wm-mail-subject">
                {item.locked ? (
                  <span className="wm-locked-subject">Encrypted message — unlock to read</span>
                ) : (
                  <span>{item.subject || "(no subject)"}</span>
                )}
                {item.tracking && <TrackingBadge tracking={item.tracking} />}
                {item.attachmentCount > 0 && (
                  <PaperclipIcon size={13} aria-label="has attachments" />
                )}
                {item.dueAt && <ClockIcon size={13} aria-label="scheduled" />}
                {item.status === "blocked" && <span className="wm-mail-state">paused</span>}
                {item.status === "failed" && <span className="wm-mail-state">failed</span>}
                {item.status === "submitting" && <span className="wm-mail-state">submitting</span>}
                {item.status === "sent-copy-pending" && (
                  <span className="wm-mail-state">accepted · saving Sent copy</span>
                )}
                {item.status === "sent-partial" && (
                  <span className="wm-mail-state">some recipients rejected</span>
                )}
                {item.status === "sent" && (
                  <span className="wm-mail-state">accepted by mail relay</span>
                )}
                {item.status === "transport-unknown" && (
                  <span className="wm-mail-state">delivery uncertain</span>
                )}
              </span>
            </span>
          </button>
          {item.detectedCode && <CodeCopy compact code={item.detectedCode} />}
          {item.threadId && (
            <IconButton
              label={item.starred ? "unstar conversation" : "star conversation"}
              className={item.starred ? "starred" : ""}
              aria-pressed={item.starred}
              onClick={onStar}
            >
              <StarIcon weight={item.starred ? "fill" : "regular"} size={15} />
            </IconButton>
          )}
          {item.threadId && (
            <Dropdown label="message actions" className="wm-row-menu" items={actions}>
              <DotsThreeIcon size={18} />
            </Dropdown>
          )}
        </ContextMenu.Trigger>
      </>
      {item.threadId && (
        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup className="wm-menu">
              <div className="wm-context-count">
                {targetCount} {targetCount === 1 ? "conversation" : "conversations"}
              </div>
              {actions.map((entry) => (
                <ContextMenu.Item
                  key={entry.label}
                  className={"wm-menu-item" + (entry.danger ? " danger" : "")}
                  disabled={entry.disabled}
                  onClick={entry.action}
                >
                  {entry.label}
                </ContextMenu.Item>
              ))}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      )}
    </ContextMenu.Root>
  );
}
