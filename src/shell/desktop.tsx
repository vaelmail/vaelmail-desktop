import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { applications } from "@/lib/desktop/registry";
import { writeGeometry } from "@/lib/desktop/windows";
import { useTheme } from "@/lib/theme";
import { RetroThemeScope } from "@/ui/retro98";
import { appComponents } from "@/apps";
import { BootScreen } from "@/app/boot";
import { WindowContext } from "./window-context";
import { DesktopShortcuts } from "./shortcuts";
import { Taskbar } from "./taskbar";
import { Wallpaper } from "./wallpaper";
import { WindowFrame } from "./window-frame";
import { openHref, useDesktop } from "./store";

let booted = false;

function Windows() {
  const windows = useDesktop((state) => state.windows);
  return (
    <>
      {windows.map((window) => {
        const Component = appComponents[window.appId];
        return (
          <WindowFrame key={window.id} id={window.id}>
            <WindowContext.Provider
              value={{
                id: window.id,
                appId: window.appId,
                href: window.href,
                instanceId: window.instanceId,
              }}
            >
              <Suspense
                fallback={
                  <div className="vd-loading">
                    loading {applications[window.appId].title.toLowerCase()}…
                  </div>
                }
              >
                <Component />
              </Suspense>
            </WindowContext.Provider>
          </WindowFrame>
        );
      })}
    </>
  );
}

export function Desktop({ onSignOut }: { onSignOut: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  const dispatch = useDesktop((state) => state.dispatch);
  const active = useDesktop((state) => state.active);
  const resolved = useTheme((state) => state.resolved);
  const [ready, setReady] = useState(false);
  const [boot, setBoot] = useState(!booted);

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const resize = () => {
      dispatch({
        type: "viewport",
        viewport: { width: element.clientWidth, height: element.clientHeight },
      });
      setReady(true);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const unsubscribe = useDesktop.subscribe((state, previous) => {
      if (state.windows !== previous.windows) writeGeometry(state);
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return;
    void openHref(applications.mail.href);
    const timer = window.setTimeout(
      () => {
        booted = true;
        setBoot(false);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200,
    );
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    const cycle = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.key !== "F6") return;
      const { windows } = useDesktop.getState();
      const next = event.shiftKey ? windows.at(-2) : windows[0];
      if (!next) return;
      event.preventDefault();
      dispatch({ type: "activate", id: next.id });
    };
    window.addEventListener("keydown", cycle);
    return () => window.removeEventListener("keydown", cycle);
  }, [dispatch]);

  const previous = useRef(active);
  useEffect(() => {
    const had = previous.current;
    previous.current = active;
    if (active || !had) return;
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (!focused || focused === document.body || !focused.isConnected) {
        area.current
          ?.querySelector<HTMLElement>(".v98-desktop-surface")
          ?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <RetroThemeScope theme={resolved === "light" ? "light" : "graphite"}>
      <div className="v98-desktop-shell" data-ready={ready} data-modality="keyboard">
        <div className="v98-desktop-area" ref={area}>
          <div className="v98-desktop-surface" aria-label="Desktop" tabIndex={0}>
            <Wallpaper />
            <DesktopShortcuts />
          </div>
          <div className="v98-window-layer">
            <Windows />
          </div>
        </div>
        <Taskbar onSignOut={onSignOut} />
        {boot && (
          <BootScreen
            leaving={ready}
            onFinished={() => {
              booted = true;
              setBoot(false);
            }}
          />
        )}
      </div>
    </RetroThemeScope>
  );
}
