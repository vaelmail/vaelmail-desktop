import { useEffect, useRef, useState, type RefObject } from "react";
import { useWorkspace } from "@/features/mail/workspace";
import {
  mutatingCommands,
  type createShortcutMatcher,
  type ShortcutCommand,
} from "@/lib/mail/shortcuts";

export { useNetworkOnline as useOnline } from "@/features/mailbox/outbox";

export function useElementWide(element: RefObject<HTMLElement | null>, enabled: boolean) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!enabled || !element.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWide((entry?.contentRect.width ?? 0) >= 1000),
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [element, enabled]);
  return wide;
}

export function useRememberPreviousView(
  mailboxId: string,
  settings: boolean,
  pathname: string,
  search: URLSearchParams,
) {
  useEffect(() => {
    if (settings) return;
    try {
      const kept = new URLSearchParams(search.toString());
      kept.delete("q");
      sessionStorage.setItem(
        "vael-previous-mail:" + mailboxId,
        pathname + (kept.size ? "?" + kept.toString() : ""),
      );
    } catch {}
  }, [settings, pathname, search, mailboxId]);
}

export function useMailKeyboard(options: {
  active: boolean;
  shortcutsEnabled: boolean;
  matcher: ReturnType<typeof createShortcutMatcher>;
  run: (command: ShortcutCommand) => void;
}) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const { active, shortcutsEnabled, matcher, run } = latest.current;
      if (!active) return;
      const target = event.target instanceof Element ? event.target : null;
      const editable = target?.closest(
        "input,textarea,select,[role=combobox],[contenteditable=true]",
      );
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        useWorkspace.getState().setCommand(!useWorkspace.getState().command);
        return;
      }
      if (
        editable ||
        target?.closest(".wm-dialog,.wm-drawer,.wm-compose") ||
        !shortcutsEnabled ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing
      ) {
        matcher.reset();
        return;
      }
      const command = matcher.press(event.key);
      if (!command) return;
      event.preventDefault();
      if (command === "pending") return;
      if (event.repeat && mutatingCommands.has(command)) return;
      run(command);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
}
