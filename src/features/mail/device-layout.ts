import { useCallback, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

const layoutAnimations = new Set<Animation>();
export function useMailboxCollapse(mailboxId: string) {
  const key = "vael-navigation:" + mailboxId;
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener("vael-layout", notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener("vael-layout", notify);
    };
  }, []);
  const get = useCallback(() => {
    try {
      return localStorage.getItem(key) === "collapsed";
    } catch {
      return false;
    }
  }, [key]);
  const collapsed = useSyncExternalStore(subscribe, get, () => false);
  const toggle = () => {
    try {
      localStorage.setItem(key, collapsed ? "expanded" : "collapsed");
      const sidebar = document.querySelector<HTMLElement>(".wm-sidebar");
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".wm-workspace, .wm-sidebar nav > a > svg, .wm-collapse-navigation",
        ),
      );
      const before = targets.map((element) => element.getBoundingClientRect());
      const previousBackdrop = document.querySelector<HTMLElement>("[data-wm-collapse-backdrop]");
      const oldWidth = Math.max(
        sidebar?.getBoundingClientRect().width || 0,
        previousBackdrop?.getBoundingClientRect().width || 0,
      );
      layoutAnimations.forEach((animation) => animation.cancel());
      layoutAnimations.clear();
      flushSync(() => window.dispatchEvent(new Event("vael-layout")));
      if (
        matchMedia("(prefers-reduced-motion: reduce)").matches ||
        !matchMedia("(min-width:768px)").matches ||
        document.documentElement.dataset.wmInput === "keyboard"
      )
        return;
      const options = {
        duration: 200,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      };
      const track = (animation: Animation, cleanup?: () => void) => {
        layoutAnimations.add(animation);
        void animation.finished
          .catch(() => {})
          .finally(() => {
            animation.cancel();
            cleanup?.();
            layoutAnimations.delete(animation);
          });
      };
      targets.forEach((element, i) => {
        const after = element.getBoundingClientRect();
        track(
          element.animate(
            [
              {
                transform: `translate(${(before[i]?.left ?? 0) - after.left}px, ${(before[i]?.top ?? 0) - after.top}px)`,
              },
              { transform: "none" },
            ],
            options,
          ),
        );
      });
      if (sidebar && oldWidth > sidebar.getBoundingClientRect().width) {
        previousBackdrop?.remove();
        const rectangle = sidebar.getBoundingClientRect();
        const surface = document.createElement("div");
        surface.dataset.wmCollapseBackdrop = "";
        surface.setAttribute("aria-hidden", "true");
        Object.assign(surface.style, {
          position: "fixed",
          left: rectangle.left + "px",
          top: rectangle.top + "px",
          width: oldWidth + "px",
          height: rectangle.height + "px",
          background: getComputedStyle(sidebar).backgroundColor,
          borderRight: getComputedStyle(sidebar).borderRight,
          transformOrigin: "left",
          pointerEvents: "none",
          zIndex: "1",
        });
        sidebar.parentElement?.append(surface);
        track(
          surface.animate(
            [{ transform: "scaleX(1)" }, { transform: `scaleX(${rectangle.width / oldWidth})` }],
            options,
          ),
          () => surface.remove(),
        );
      }
      if (sidebar && oldWidth < sidebar.getBoundingClientRect().width)
        track(
          sidebar.animate(
            [
              {
                clipPath: `inset(0 ${sidebar.getBoundingClientRect().width - oldWidth}px 0 0)`,
              },
              { clipPath: "inset(0 0 0 0)" },
            ],
            options,
          ),
        );
    } catch {}
  };
  return [collapsed, toggle] as const;
}

export function useWide() {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      const m = matchMedia("(min-width: 1280px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    }, []),
    () => matchMedia("(min-width: 1280px)").matches,
    () => false,
  );
}
