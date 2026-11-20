import { toast } from "sonner";
import { RetroMenu } from "@/ui/retro98";
import { useWorkspace } from "@/features/mail/workspace";
import type { MailAction, MailItem } from "@/lib/mail/types";
import type { ReaderCommands } from "./reader";

export function MailMenubar({
  go,
  compose,
  items,
  selection,
  threadId,
  readerCommands,
  busy,
  refreshing,
  refresh,
  runAction,
  selectLoaded,
  clearSelection,
  focusSearch,
  showShortcuts,
}: {
  go: (destination: string) => void;
  compose: () => unknown;
  items: MailItem[];
  selection: string[];
  threadId: string | null;
  readerCommands: ReaderCommands | null;
  busy: boolean;
  refreshing: boolean;
  refresh: () => Promise<unknown>;
  runAction: (type: MailAction["type"], value?: string, ids?: string[]) => Promise<void>;
  selectLoaded: () => void;
  clearSelection: () => void;
  focusSearch: () => void;
  showShortcuts: () => void;
}) {
  return (
    <nav className="v98-mail-menubar" aria-label="Mail menu">
      <RetroMenu
        label="File"
        items={[
          { id: "compose", label: "New Message", onSelect: () => void compose() },
          { id: "drafts", label: "Open Drafts", onSelect: () => go("drafts") },
          { id: "account", label: "My Account", onSelect: () => go("/dashboard") },
        ]}
      />
      <RetroMenu
        label="Edit"
        items={[
          {
            id: "select",
            label: "Select loaded conversations",
            disabled: !items.some((i) => i.threadId),
            onSelect: selectLoaded,
          },
          {
            id: "clear",
            label: "Clear selection",
            disabled: !selection.length,
            onSelect: clearSelection,
          },
          { id: "find", label: "Find mail", onSelect: focusSearch },
        ]}
      />
      <RetroMenu
        label="View"
        items={[
          { id: "inbox", label: "Inbox", onSelect: () => go("inbox") },
          { id: "reading", label: "Reading preferences", onSelect: () => go("settings/reading") },
          {
            id: "refresh",
            label: "Refresh",
            disabled: refreshing,
            onSelect: () => void refresh().catch(() => toast.error("Could not refresh mail")),
          },
        ]}
      />
      <RetroMenu
        label="Message"
        items={[
          {
            id: "reply",
            label: "Reply",
            disabled: !threadId || !readerCommands,
            onSelect: () => readerCommands?.reply(),
          },
          {
            id: "reply-all",
            label: "Reply All",
            disabled: !threadId || !readerCommands,
            onSelect: () => readerCommands?.replyAll(),
          },
          {
            id: "forward",
            label: "Forward",
            disabled: !threadId || !readerCommands,
            onSelect: () => readerCommands?.forward(),
          },
          ...(["read", "unread", "archive", "trash", "spam"] as const).map((type) => ({
            id: type,
            label: {
              read: "Mark as read",
              unread: "Mark as unread",
              archive: "Archive",
              trash: "Delete",
              spam: "Junk",
            }[type],
            disabled: busy || (!selection.length && !threadId),
            onSelect: () =>
              void runAction(type, undefined, selection.length ? selection : [threadId!]),
          })),
        ]}
      />
      <RetroMenu
        label="Tools"
        items={[
          { id: "contacts", label: "Contacts", onSelect: () => go("contacts") },
          { id: "aliases", label: "Aliases", onSelect: () => go("aliases") },
          { id: "services", label: "Services", onSelect: () => go("services") },
          { id: "settings", label: "Settings", onSelect: () => go("settings/appearance") },
        ]}
      />
      <RetroMenu
        label="Help"
        items={[
          {
            id: "commands",
            label: "Find commands",
            onSelect: () => useWorkspace.getState().setCommand(true),
          },
          { id: "shortcuts", label: "Keyboard shortcuts", onSelect: showShortcuts },
        ]}
      />
    </nav>
  );
}
