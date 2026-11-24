import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { applications, type AppId } from "@/lib/desktop/registry";
import type { DesktopWindow } from "@/lib/desktop/windows";
import { useTheme } from "@/lib/theme";
import { RetroThemeScope } from "@/ui/retro98";
import { appComponents } from "@/apps";
import { ComposeDock } from "./compose-dock";
import { Launcher } from "./launcher";
import { Sidebar, useSidebarCollapsed } from "./sidebar";
import { openHref, useDesktop } from "./store";
import { TitleBar } from "./title-bar";
import { ViewBoundary } from "./view-boundary";
import { ViewFrame } from "./view-frame";
import { ResizeEdges } from "./window-controls";
import { WindowContext } from "./window-context";

function Content({ window }: { window: DesktopWindow }) {
  const Component = appComponents[window.appId];
  return (
    <WindowContext.Provider
      value={{
        id: window.id,
        appId: window.appId,
        href: window.href,
        instanceId: window.instanceId,
      }}
    >
      <ViewBoundary
        label={applications[window.appId].title}
        onHome={window.appId === "mail" ? undefined : () => void openHref(applications.mail.href)}
      >
        <Suspense
          fallback={
            <div className="vx-loading">
              <span className="vx-spinner" aria-hidden />
              Loading {applications[window.appId].title.toLowerCase()}…
            </div>
          }
        >
          <Component />
        </Suspense>
      </ViewBoundary>
    </WindowContext.Provider>
  );
}

function currentView(windows: DesktopWindow[]): DesktopWindow | undefined {
  return windows.findLast((window) => window.appId !== "compose");
}

export function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const windows = useDesktop((state) => state.windows);
  const active = useDesktop((state) => state.active);
  const dispatch = useDesktop((state) => state.dispatch);
  const resolved = useTheme((state) => state.resolved);
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const content = useRef<HTMLDivElement>(null);
  const views = useMemo(
    () =>
      windows
        .filter((window) => window.appId !== "compose")
        .sort((a, b) => a.id.localeCompare(b.id)),
    [windows],
  );
  const current = currentView(windows);
  const currentApp: AppId | null = current?.appId ?? null;
  const title = current ? (current.title ?? applications[current.appId].title) : "";

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const resize = () =>
      dispatch({
        type: "viewport",
        viewport: { width: element.clientWidth, height: element.clientHeight },
      });
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [dispatch]);

  useEffect(() => {
    if (!useDesktop.getState().windows.some((window) => window.appId !== "compose")) {
      void openHref(applications.mail.href);
    }
  }, []);

  useEffect(() => {
    const order = ["mail", "contacts", "aliases", "services", "account", "settings"] as const;
    const jump = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const index = Number(event.key) - 1;
      const id = order[index];
      if (!id) return;
      event.preventDefault();
      void openHref(applications[id].href);
    };
    window.addEventListener("keydown", jump);
    return () => window.removeEventListener("keydown", jump);
  }, []);

  useEffect(() => {
    document.title = title ? `${title} · VaelMail` : "VaelMail";
  }, [title]);

  return (
    <RetroThemeScope theme={resolved === "light" ? "light" : "graphite"}>
      <div className="vx-app" data-sidebar={collapsed ? "collapsed" : "expanded"}>
        <ResizeEdges />
        <TitleBar title={title} signedIn />
        <div className="vx-body">
          <Sidebar
            current={currentApp}
            collapsed={collapsed}
            onCollapse={setCollapsed}
            onSignOut={onSignOut}
          />
          <main
            className="vx-content"
            ref={content}
            onPointerDownCapture={() => {
              if (current && active !== current.id) dispatch({ type: "activate", id: current.id });
            }}
          >
            {views.map((window) => (
              <ViewFrame
                key={window.id}
                id={window.id}
                visible={window.id === current?.id}
                label={window.title ?? applications[window.appId].title}
              >
                <Content window={window} />
              </ViewFrame>
            ))}
            <ComposeDock render={(window) => <Content window={window} />} />
          </main>
        </div>
        <Launcher />
      </div>
    </RetroThemeScope>
  );
}
