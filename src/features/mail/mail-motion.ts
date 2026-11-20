import { useDesktop } from "@/shell/store";
import { useEffect, useLayoutEffect } from "react";
import { flushSync } from "react-dom";

type Kind = "mailbox" | "page" | "settings" | "reader" | "conversation" | "filter";
type Options = { onCommitted?: () => void };
type Capture = {
  name: string;
  rank: number;
  count: number;
  left: number;
  top: number;
};
type Navigation = {
  id: number;
  key: string;
  kind: Kind;
  update: () => void;
  onCommitted?: () => void;
  notified?: boolean;
  committed: boolean;
  resolveCommit?: () => void;
  transition?: ViewTransition;
  readyAt?: number;
  restore: (() => void)[];
  snapshots: Animation[];
};

let sequence = 0;
let active: Navigation | undefined;
let delayed: MutationObserver | undefined;
let historyEntrance = false;
const animations = new Set<Animation>();

export function mailContentKey(location: string) {
  const url = new URL(location, "https://vael.invalid");
  url.searchParams.delete("compose");
  url.searchParams.delete("control");
  url.searchParams.sort();
  return url.pathname + "?" + url.searchParams;
}

function allowsMotion() {
  return (
    !document.querySelector(".v98-desktop-shell") &&
    document.visibilityState === "visible" &&
    document.documentElement.dataset.wmInput !== "keyboard" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function easing() {
  return getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim();
}

function region(kind: Kind) {
  const main = document.getElementById("wm-main");
  const selector =
    kind === "settings"
      ? ".wm-settings-content"
      : kind === "mailbox" || kind === "filter"
        ? ".wm-mail-content"
        : kind === "reader" || kind === "conversation"
          ? ".wm-reader-host"
          : null;
  return (selector && main?.querySelector<HTMLElement>(selector)) || main;
}

function visibleRows(root: HTMLElement) {
  const viewport = root.getBoundingClientRect();
  return Array.from(root.querySelectorAll<HTMLElement>(".wm-swipe-row")).filter((row) => {
    const rect = row.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom;
  });
}

function classify(from: URL, to: URL): Kind {
  const isMail = (path: string) =>
    !/^\/webmail\/(settings(?:\/|$)|services$|contacts$|aliases$)/.test(path);
  if (
    from.pathname.startsWith("/webmail/settings/") &&
    to.pathname.startsWith("/webmail/settings/")
  )
    return "settings";
  if (!isMail(from.pathname) || !isMail(to.pathname)) return "page";
  if (from.pathname !== to.pathname) return "mailbox";
  const oldThread = from.searchParams.get("thread"),
    newThread = to.searchParams.get("thread");
  from.searchParams.delete("thread");
  to.searchParams.delete("thread");
  if (mailContentKey(from.href) !== mailContentKey(to.href)) return "filter";
  return oldThread && newThread ? "conversation" : "reader";
}

function restoreNames(nav: Navigation) {
  nav.restore.splice(0).forEach((restore) => restore());
}

function cancelMotion() {
  active?.resolveCommit?.();
  active?.transition?.skipTransition();
  if (active) restoreNames(active);
  active = undefined;
  delayed?.disconnect();
  delayed = undefined;
  animations.forEach((animation) => animation.cancel());
  animations.clear();
  delete document.documentElement.dataset.wmTransition;
}

function track(animation: Animation, release = true) {
  animations.add(animation);
  void animation.finished
    .catch(() => {})
    .finally(() => {
      if (!release) return;
      animations.delete(animation);
      animation.cancel();
    });
  return animation;
}

function capture(nav: Navigation): Capture[] {
  const root = region(nav.kind);
  if (!root) return [];
  const targets = [{ element: root, name: "wm-motion-region", rank: 0, count: 1 }];
  if (nav.kind === "mailbox") {
    const rows = visibleRows(root);
    rows.forEach((element, rank) =>
      targets.push({
        element,
        name: "wm-motion-row-" + rank,
        rank,
        count: rows.length,
      }),
    );
  }
  return targets.map(({ element, name, rank, count }) => {
    const previous = element.style.viewTransitionName;
    element.style.viewTransitionName = name;
    nav.restore.push(() => {
      element.style.viewTransitionName = previous;
    });
    const { left, top } = element.getBoundingClientRect();
    return { name, rank, count, left, top };
  });
}

const stagger = (rank: number, count: number) => (count > 1 ? (rank / (count - 1)) * 40 : 0);

function frames(kind: Kind, entering: boolean, x = 0, y = 0): Keyframe[] {
  const offset =
    kind === "conversation" || kind === "filter"
      ? "none"
      : kind === "reader"
        ? "translateX(8px)"
        : `translateY(${kind === "settings" ? 4 : entering ? 6 : -4}px)`;
  const base = x || y ? `translate(${x}px, ${y}px)` : "";
  const hidden = {
    opacity: 0,
    transform: [base, offset === "none" ? "" : offset].filter(Boolean).join(" ") || "none",
  };
  const shown = { opacity: 1, transform: base || "none" };
  return entering ? [hidden, shown] : [shown, hidden];
}

const duration = (kind: Kind) =>
  kind === "conversation" || kind === "filter"
    ? 120
    : kind === "mailbox" || kind === "settings"
      ? 160
      : 180;

function animateEntrance(kind: Kind, root: HTMLElement, id: number, delay = 0) {
  if (id !== sequence || !allowsMotion() || !root.animate) return;
  const rows = kind === "mailbox" ? visibleRows(root) : [];
  const targets = rows.length ? rows : [root];
  const curve = easing();
  targets.forEach((element, rank) => {
    if (element.style.viewTransitionName.startsWith("wm-motion-row-")) return;
    track(
      element.animate(frames(kind, true), {
        duration: duration(kind),
        delay: delay + (rows.length ? stagger(rank, rows.length) : 0),
        easing: curve,
        fill: "both",
      }),
    );
  });
}

function watchLoading(nav: Navigation) {
  const main = document.getElementById("wm-main");
  if (
    !main ||
    (main.childElementCount &&
      !main.querySelector(".wm-skeleton") &&
      !(
        nav.kind === "mailbox" &&
        main.querySelector(".wm-virtual-list") &&
        !visibleRows(region(nav.kind) || main).length
      ))
  )
    return;
  delayed?.disconnect();
  delayed = new MutationObserver(() => {
    if (nav.id !== sequence || mailContentKey(currentHref()) !== nav.key) {
      delayed?.disconnect();
      delayed = undefined;
      return;
    }
    const root = region(nav.kind);
    if (!root || !main.childElementCount || main.querySelector(".wm-skeleton")) return;
    if (
      nav.kind === "mailbox" &&
      root.querySelector(".wm-virtual-list") &&
      !visibleRows(root).length
    )
      return;
    delayed?.disconnect();
    delayed = undefined;
    const reveal = () =>
      requestAnimationFrame(() => {
        const delay =
          active === nav && nav.readyAt !== undefined
            ? Math.max(0, 80 - (performance.now() - nav.readyAt))
            : 0;
        animateEntrance(nav.kind, root, nav.id, delay);
      });
    if (active === nav && nav.transition && nav.readyAt === undefined)
      void nav.transition.ready.then(reveal).catch(() => {});
    else reveal();
  });
  delayed.observe(main, { childList: true, subtree: true });
}

function commit(nav: Navigation) {
  if (nav.id !== sequence || nav.committed) return;
  nav.committed = true;
  flushSync(nav.update);
}

function waitForCommit(nav: Navigation) {
  if (document.getElementById("wm-main")?.dataset.wmLocation === nav.key) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 120);
    nav.resolveCommit = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
}

async function afterCommit(nav: Navigation, capturing = false) {
  await waitForCommit(nav);
  if (!capturing) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (nav.id !== sequence) return;
  if (!nav.notified) {
    nav.notified = true;
    nav.onCommitted?.();
  }
  watchLoading(nav);
}

async function fallback(nav: Navigation) {
  const root = region(nav.kind);
  if (root?.animate && allowsMotion()) {
    const keyframes =
      nav.kind === "mailbox"
        ? [
            { clipPath: "inset(0 0 0 0)", opacity: 1 },
            { clipPath: "inset(100% 0 0 0)", opacity: 0 },
          ]
        : frames(nav.kind, false);
    const exit = track(
      root.animate(keyframes, { duration: 80, easing: easing(), fill: "both" }),
      false,
    );
    nav.snapshots.push(exit);
    await exit.finished.catch(() => {});
  }
  if (nav.id !== sequence) return;
  commit(nav);
  await afterCommit(nav);
  nav.snapshots.forEach((animation) => {
    animations.delete(animation);
    animation.cancel();
  });
  if (nav.id !== sequence) return;
  const incoming = region(nav.kind);
  if (incoming) animateEntrance(nav.kind, incoming, nav.id);
  if (active === nav) active = undefined;
}

function currentHref(): string {
  return (
    useDesktop.getState().windows.find((window) => window.id === "mail")?.href ?? "/webmail/inbox"
  );
}

export function transitionMail(destination: string, update: () => void, options: Options = {}) {
  const from = new URL(currentHref(), "https://desktop.invalid"),
    to = new URL(destination, from);
  cancelMotion();
  const id = ++sequence;
  if (mailContentKey(from.href) === mailContentKey(to.href) || !allowsMotion() || !region("page")) {
    update();
    if (options.onCommitted)
      requestAnimationFrame(() => {
        if (id === sequence) options.onCommitted?.();
      });
    return;
  }
  const nav: Navigation = {
    id,
    key: mailContentKey(to.href),
    kind: classify(from, to),
    update,
    onCommitted: options.onCommitted,
    committed: false,
    restore: [],
    snapshots: [],
  };
  active = nav;
  if (!document.startViewTransition) {
    void fallback(nav);
    return;
  }
  document.documentElement.dataset.wmTransition = nav.kind;
  const old = capture(nav);
  let incoming: Capture[] = [];
  try {
    nav.transition = document.startViewTransition(async () => {
      if (id !== sequence) return;
      restoreNames(nav);
      commit(nav);
      await afterCommit(nav, true);
      if (id === sequence) incoming = capture(nav);
    });
    void nav.transition.ready
      .then(() => {
        if (id !== sequence) return;
        nav.readyAt = performance.now();
        const curve = easing();
        for (const [items, entering] of [
          [old, false],
          [incoming, true],
        ] as const) {
          items.forEach(({ name, rank, count, left, top }) => {
            const row = name.startsWith("wm-motion-row-");
            const delay = (entering ? 80 : 0) + (row ? stagger(rank, count) : 0);
            const target = !entering && incoming.find((item) => item.name === name);
            const x = target ? left - target.left : 0;
            const y = target ? top - target.top : 0;
            nav.snapshots.push(
              track(
                document.documentElement.animate(frames(nav.kind, entering, x, y), {
                  pseudoElement: `::view-transition-${entering ? "new" : "old"}(${name})`,
                  duration: entering ? duration(nav.kind) : 80,
                  delay,
                  easing: curve,
                  fill: "both",
                }),
                false,
              ),
            );
          });
        }
      })
      .catch(async () => {
        if (id !== sequence) return;
        nav.transition?.skipTransition();
        restoreNames(nav);
        delete document.documentElement.dataset.wmTransition;
        commit(nav);
        await afterCommit(nav);
        const root = region(nav.kind);
        if (root) animateEntrance(nav.kind, root, id);
      });
    void nav.transition.finished
      .catch(() => {})
      .finally(() => {
        nav.snapshots.forEach((animation) => {
          animations.delete(animation);
          animation.cancel();
        });
        if (active !== nav) return;
        restoreNames(nav);
        active = undefined;
        delete document.documentElement.dataset.wmTransition;
      });
  } catch {
    restoreNames(nav);
    delete document.documentElement.dataset.wmTransition;
    void fallback(nav);
  }
}

export function useMailMotion(scope: string, location: string) {
  useLayoutEffect(() => {
    if (active?.key === location) active.resolveCommit?.();
    if (historyEntrance) {
      historyEntrance = false;
      const id = sequence;
      requestAnimationFrame(() => {
        const main = region("page");
        if (main) animateEntrance("page", main, id);
      });
    }
  }, [location]);
  useEffect(() => {
    const pop = () => {
      cancelMotion();
      ++sequence;
      historyEntrance = true;
    };
    const finish = (event: Event) => {
      if (event.type !== "beforeprint" && allowsMotion()) return;
      if (active) commit(active);
      cancelMotion();
      ++sequence;
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("popstate", pop);
    window.addEventListener("keydown", finish);
    window.addEventListener("beforeprint", finish);
    document.addEventListener("visibilitychange", finish);
    reduce.addEventListener("change", finish);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("beforeprint", finish);
      document.removeEventListener("visibilitychange", finish);
      reduce.removeEventListener("change", finish);
      cancelMotion();
      ++sequence;
      historyEntrance = false;
    };
  }, [scope]);
}
