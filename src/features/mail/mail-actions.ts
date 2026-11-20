import type { MailAction, MailItem } from "@/lib/mail/types";
import type { MenuEntry } from "@/ui/controls";
type OrganizeAction = "move" | "label" | "snooze" | "delete";
export function mailActions({
  items,
  view,
  busy,
  run,
  organize,
}: {
  items: Pick<MailItem, "unread" | "starred">[];
  view: string;
  busy: boolean;
  run: (type: MailAction["type"]) => void;
  organize: (type: OrganizeAction) => void;
}): MenuEntry[] {
  const unread = items.some((item) => item.unread),
    starred = items.every((item) => item.starred);
  return [
    {
      label: unread ? "mark as read" : "mark as unread",
      action: () => run(unread ? "read" : "unread"),
    },
    {
      label: starred ? "unstar" : "star",
      action: () => run(starred ? "unstar" : "star"),
    },
    {
      label: "archive",
      action: () => run("archive"),
      disabled: view === "archive",
    },
    {
      label: "trash",
      action: () => run("trash"),
      danger: true,
      disabled: view === "trash",
    },
    { label: "move to folder", action: () => organize("move") },
    { label: "add label", action: () => organize("label") },
    { label: "snooze", action: () => organize("snooze") },
    {
      label: "restore to inbox",
      action: () => run("restore"),
      disabled: view === "inbox",
    },
    {
      label: "mark as spam",
      action: () => run("spam"),
      disabled: view === "spam",
    },
    {
      label: "delete permanently",
      action: () => organize("delete"),
      danger: true,
      disabled: !["trash", "spam"].includes(view),
    },
  ].map((item) => ({ ...item, disabled: busy || item.disabled }));
}
