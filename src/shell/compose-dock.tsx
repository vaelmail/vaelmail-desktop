import { Suspense, useState, type ReactNode } from "react";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CaretDownIcon,
  CaretUpIcon,
  XIcon,
} from "@phosphor-icons/react";
import { applications } from "@/lib/desktop/registry";
import type { DesktopWindow } from "@/lib/desktop/windows";
import { WindowGuardContext } from "./close-guard";
import { useDesktop } from "./store";
import { useGuards } from "./view-frame";

function ComposePanel({ window, children }: { window: DesktopWindow; children: ReactNode }) {
  const dispatch = useDesktop((state) => state.dispatch);
  const active = useDesktop((state) => state.active === window.id);
  const guards = useGuards(window.id);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const title = window.title ?? applications.compose.title;
  const collapsed = window.mode === "minimized";
  const large = window.mode === "maximized";

  const close = async () => {
    if (closing) return;
    setClosing(true);
    setError("");
    try {
      for (const guard of guards) await guard();
      dispatch({ type: "close", id: window.id });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save this draft.");
    } finally {
      setClosing(false);
    }
  };

  return (
    <WindowGuardContext.Provider value={guards}>
      <section
        className="vx-compose-panel"
        data-state={collapsed ? "collapsed" : large ? "large" : "docked"}
        data-active={active || undefined}
        data-attention={window.attention || undefined}
        aria-label={title}
        onPointerDown={() => !active && dispatch({ type: "activate", id: window.id })}
      >
        <header
          className="vx-compose-head"
          onDoubleClick={() =>
            dispatch({ type: collapsed ? "restore" : "minimize", id: window.id })
          }
        >
          <span className="vx-compose-title">{title}</span>
          <div className="vx-compose-actions">
            <button
              type="button"
              className="vx-icon-button"
              aria-label={collapsed ? "Expand" : "Collapse"}
              title={collapsed ? "Expand" : "Collapse"}
              onClick={() => dispatch({ type: collapsed ? "restore" : "minimize", id: window.id })}
            >
              {collapsed ? <CaretUpIcon size={15} /> : <CaretDownIcon size={15} />}
            </button>
            {!collapsed && (
              <button
                type="button"
                className="vx-icon-button"
                aria-label={large ? "Dock" : "Enlarge"}
                title={large ? "Dock" : "Enlarge"}
                onClick={() => dispatch({ type: "maximize", id: window.id })}
              >
                {large ? <ArrowsInSimpleIcon size={15} /> : <ArrowsOutSimpleIcon size={15} />}
              </button>
            )}
            <button
              type="button"
              className="vx-icon-button"
              aria-label="Close"
              title="Save and close"
              disabled={closing}
              onClick={() => void close()}
            >
              <XIcon size={15} />
            </button>
          </div>
        </header>
        {error && (
          <p className="vx-compose-error" role="alert">
            {error}
          </p>
        )}
        <div className="vx-compose-body v98-window-content" hidden={collapsed}>
          <Suspense fallback={<div className="vx-loading">Opening draft…</div>}>
            {children}
          </Suspense>
        </div>
      </section>
    </WindowGuardContext.Provider>
  );
}

export function ComposeDock({ render }: { render: (window: DesktopWindow) => ReactNode }) {
  const windows = useDesktop((state) => state.windows);
  const drafts = windows.filter((window) => window.appId === "compose");
  if (drafts.length === 0) return null;
  const large = drafts.some((window) => window.mode === "maximized");
  return (
    <div className="vx-compose-dock" data-large={large || undefined}>
      {drafts.map((window) => (
        <ComposePanel key={window.id} window={window}>
          {render(window)}
        </ComposePanel>
      ))}
    </div>
  );
}
