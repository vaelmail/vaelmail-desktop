export type ShortcutCommand =
  | "compose"
  | "search"
  | "help"
  | "palette"
  | "back"
  | "next"
  | "previous"
  | "archive"
  | "trash"
  | "spam"
  | "star"
  | "read"
  | "unread"
  | "select"
  | "selectAll"
  | "reply"
  | "replyAll"
  | "forward"
  | "go:inbox"
  | "go:starred"
  | "go:sent"
  | "go:drafts"
  | "go:archive"
  | "go:all"
  | "go:contacts"
  | "go:settings";

type Shortcut = {
  keys: readonly string[];
  display: string;
  label: string;
  command: ShortcutCommand;
};

type ShortcutGroup = { title: string; items: readonly Shortcut[] };

const s = (
  keys: readonly string[],
  display: string,
  label: string,
  command: ShortcutCommand,
): Shortcut => ({ keys, display, label, command });

export const shortcutGroups: readonly ShortcutGroup[] = [
  {
    title: "navigation",
    items: [
      s(["j"], "J", "next conversation", "next"),
      s(["k"], "K", "previous conversation", "previous"),
      s(["u"], "U", "back to list", "back"),
      s(["Escape"], "Esc", "close conversation / clear selection", "back"),
      s(["/"], "/", "search mail", "search"),
      s(["g", "i"], "G then I", "go to inbox", "go:inbox"),
      s(["g", "s"], "G then S", "go to starred", "go:starred"),
      s(["g", "t"], "G then T", "go to sent", "go:sent"),
      s(["g", "d"], "G then D", "go to drafts", "go:drafts"),
      s(["g", "e"], "G then E", "go to archive", "go:archive"),
      s(["g", "a"], "G then A", "go to all mail", "go:all"),
      s(["g", "c"], "G then C", "go to contacts", "go:contacts"),
      s(["g", ","], "G then ,", "go to settings", "go:settings"),
    ],
  },
  {
    title: "conversation",
    items: [
      s(["c"], "C", "compose", "compose"),
      s(["r"], "R", "reply", "reply"),
      s(["a"], "A", "reply all", "replyAll"),
      s(["f"], "F", "forward", "forward"),
      s(["e"], "E", "archive", "archive"),
      s(["#"], "#", "move to trash", "trash"),
      s(["!"], "!", "report spam", "spam"),
      s(["s"], "S", "star / unstar", "star"),
      s(["I"], "Shift I", "mark as read", "read"),
      s(["U"], "Shift U", "mark as unread", "unread"),
      s(["x"], "X", "select / deselect conversation", "select"),
      s(["*"], "*", "select / clear loaded conversations", "selectAll"),
    ],
  },
  {
    title: "anywhere",
    items: [
      s(["?"], "?", "show keyboard shortcuts", "help"),
      s(["k"], "Ctrl / ⌘ K", "quick actions", "palette"),
      s(["Enter"], "Ctrl / ⌘ Enter", "send from composer", "compose"),
    ],
  },
];

const bindings: readonly Shortcut[] = shortcutGroups.flatMap((group) =>
  group.items.filter((item) => !item.display.startsWith("Ctrl")),
);

export const mutatingCommands: ReadonlySet<ShortcutCommand> = new Set([
  "archive",
  "trash",
  "spam",
  "star",
  "read",
  "unread",
  "compose",
  "reply",
  "replyAll",
  "forward",
]);

export const CHORD_TIMEOUT_MS = 1500;

type ShortcutMatcher = {
  press(key: string, now?: number): ShortcutCommand | "pending" | null;
  reset(): void;
};

export function createShortcutMatcher(timeout = CHORD_TIMEOUT_MS): ShortcutMatcher {
  let prefix: string | null = null,
    prefixAt = 0;
  const prefixes = new Set(bindings.filter((b) => b.keys.length > 1).map((b) => b.keys[0]));
  return {
    press(key, now = Date.now()) {
      if (prefix !== null && now - prefixAt <= timeout) {
        const first = prefix;
        prefix = null;
        const chord = bindings.find(
          (b) => b.keys.length === 2 && b.keys[0] === first && b.keys[1] === key,
        );
        return chord ? chord.command : null;
      }
      prefix = null;
      if (prefixes.has(key)) {
        prefix = key;
        prefixAt = now;
        return "pending";
      }
      return bindings.find((b) => b.keys.length === 1 && b.keys[0] === key)?.command ?? null;
    },
    reset() {
      prefix = null;
    },
  };
}

export const goDestinations: Partial<Record<ShortcutCommand, string>> = {
  "go:inbox": "inbox",
  "go:starred": "starred",
  "go:sent": "sent",
  "go:drafts": "drafts",
  "go:archive": "archive",
  "go:all": "all",
  "go:contacts": "contacts",
  "go:settings": "settings/appearance",
};
