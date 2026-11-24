import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { native } from "@/lib/bridge/invoke";
import { platform } from "./platform";

function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!native) return;
    const current = getCurrentWindow();
    let alive = true;
    const read = () =>
      void current
        .isMaximized()
        .then((value) => alive && setMaximized(value))
        .catch(() => undefined);
    read();
    const stop = current.onResized(read);
    return () => {
      alive = false;
      void stop.then((unlisten) => unlisten());
    };
  }, []);
  return maximized;
}

function act(action: "minimize" | "toggleMaximize" | "close") {
  if (!native) return;
  const current = getCurrentWindow();
  void current[action]().catch(() => undefined);
}

export function WindowControls() {
  const maximized = useMaximized();
  if (platform === "mac") return null;
  return (
    <div className="vx-window-controls" role="group" aria-label="Window">
      <button
        type="button"
        className="vx-window-button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => act("minimize")}
      >
        <svg viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button
        type="button"
        className="vx-window-button"
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => act("toggleMaximize")}
      >
        {maximized ? (
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M.5.5h9v9h-9z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="vx-window-button"
        data-close
        aria-label="Close"
        title="Close"
        onClick={() => act("close")}
      >
        <svg viewBox="0 0 10 10" aria-hidden>
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}

const edges = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

const directions = {
  n: "North",
  s: "South",
  e: "East",
  w: "West",
  ne: "NorthEast",
  nw: "NorthWest",
  se: "SouthEast",
  sw: "SouthWest",
} as const;

export function ResizeEdges() {
  const maximized = useMaximized();
  if (platform !== "linux" || !native || maximized) return null;
  return (
    <>
      {edges.map((edge) => (
        <div
          key={edge}
          className="vx-resize"
          data-edge={edge}
          aria-hidden
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void getCurrentWindow()
              .startResizeDragging(directions[edge])
              .catch(() => undefined);
          }}
        />
      ))}
    </>
  );
}
