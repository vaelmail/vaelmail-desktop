import { applications, windowIdFor, type AppId, type AppLocation, type Bounds } from "./registry";

export type Viewport = { width: number; height: number };
export type WindowMode = "normal" | "maximized" | "minimized";
export type SnapSide = "left" | "right";
export type ResizeEdge = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw";

export type DesktopWindow = AppLocation & {
  id: string;
  bounds: Bounds;
  mode: WindowMode;
  restoreMode: Exclude<WindowMode, "minimized">;
  snapped?: SnapSide | undefined;
  unsnappedBounds?: Bounds | undefined;
  attention?: boolean | undefined;
  notification?: number | undefined;
};

export type DesktopState = {
  windows: DesktopWindow[];
  active: string | null;
  viewport: Viewport;
  shown: string[];
};

export type WindowAction =
  | { type: "open"; location: AppLocation; background?: boolean }
  | { type: "navigate"; id: string; href: string }
  | { type: "title"; id: string; title: string }
  | { type: "activate" | "minimize" | "maximize" | "restore" | "close"; id: string }
  | { type: "bounds"; id: string; bounds: Bounds }
  | { type: "attention"; id: string; attention: boolean }
  | { type: "notification"; id: string; unread: boolean }
  | { type: "viewport"; viewport: Viewport }
  | { type: "snap"; id: string; side: SnapSide }
  | { type: "arrange"; layout: "tile" | "cascade" }
  | { type: "show-desktop" }
  | { type: "reset" }
  | { type: "clear" };

const layoutKey = "vael98-layout-v2";
const snapThreshold = 768;

export function initialDesktop(): DesktopState {
  return { windows: [], active: null, viewport: { width: 1440, height: 860 }, shown: [] };
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function constrainBounds(bounds: Bounds, viewport: Viewport, appId: AppId): Bounds {
  const minimum = applications[appId].minimum;
  const width = Math.min(
    Math.max(minimum.width, finite(bounds.width, minimum.width)),
    viewport.width,
  );
  const height = Math.min(
    Math.max(minimum.height, finite(bounds.height, minimum.height)),
    viewport.height,
  );
  return {
    width,
    height,
    x: Math.max(0, Math.min(viewport.width - width, finite(bounds.x, 0))),
    y: Math.max(0, Math.min(viewport.height - height, finite(bounds.y, 0))),
  };
}

export function snapBounds(viewport: Viewport, side: SnapSide): Bounds {
  const split = Math.floor(viewport.width / 2);
  return {
    x: side === "left" ? 0 : split,
    y: 0,
    width: side === "left" ? split : viewport.width - split,
    height: viewport.height,
  };
}

export function canSnap(viewport: Viewport, appId: AppId): boolean {
  return (
    viewport.width >= snapThreshold &&
    Math.floor(viewport.width / 2) >= applications[appId].minimum.width
  );
}

export function resizeBounds(
  initial: Bounds,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  viewport: Viewport,
  appId: AppId,
): Bounds {
  const minimum = applications[appId].minimum;
  const minWidth = Math.min(minimum.width, viewport.width);
  const minHeight = Math.min(minimum.height, viewport.height);
  let left = initial.x;
  let top = initial.y;
  let right = left + initial.width;
  let bottom = top + initial.height;
  if (edge.includes("w")) left = Math.max(0, Math.min(right - minWidth, left + dx));
  if (edge.includes("e")) right = Math.min(viewport.width, Math.max(left + minWidth, right + dx));
  if (edge.includes("n")) top = Math.max(0, Math.min(bottom - minHeight, top + dy));
  if (edge.includes("s"))
    bottom = Math.min(viewport.height, Math.max(top + minHeight, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function defaultBounds(appId: AppId, viewport: Viewport, offset = 0, stored?: Bounds): Bounds {
  if (stored) return constrainBounds(stored, viewport, appId);
  const size = applications[appId].size;
  return constrainBounds(
    {
      ...size,
      x: (viewport.width - size.width) / 2 + offset,
      y: Math.max(16, (viewport.height - size.height) / 2) + offset,
    },
    viewport,
    appId,
  );
}

function topVisible(windows: DesktopWindow[]): string | null {
  return windows.findLast((window) => window.mode !== "minimized")?.id ?? null;
}

function replace(state: DesktopState, id: string, change: Partial<DesktopWindow>): DesktopState {
  return {
    ...state,
    windows: state.windows.map((window) => (window.id === id ? { ...window, ...change } : window)),
  };
}

function raise(state: DesktopState, next: DesktopWindow): DesktopState {
  return {
    ...state,
    windows: [...state.windows.filter((window) => window.id !== next.id), next],
    active: next.id,
    shown: [],
  };
}

function open(state: DesktopState, action: Extract<WindowAction, { type: "open" }>): DesktopState {
  const { location } = action;
  if (location.appId === "compose" && !location.instanceId) return state;
  const id = windowIdFor(location);
  const existing = state.windows.find((window) => window.id === id);
  if (existing) {
    if (action.background) return state;
    const mode = existing.mode === "minimized" ? existing.restoreMode : existing.mode;
    return raise(state, { ...existing, ...location, mode, notification: undefined });
  }
  const stored = readGeometry()[location.appId];
  const next: DesktopWindow = {
    ...location,
    id,
    bounds: defaultBounds(location.appId, state.viewport, state.windows.length * 16, stored),
    mode: action.background ? "minimized" : "maximized",
    restoreMode: "maximized",
  };
  if (action.background) return { ...state, windows: [next, ...state.windows] };
  return raise(state, next);
}

function arrange(state: DesktopState, layout: "tile" | "cascade"): DesktopState {
  const visible = state.windows.filter((window) => window.mode !== "minimized");
  const { viewport } = state;
  if (visible.length === 0 || viewport.width < snapThreshold) return state;
  const widest = Math.max(...visible.map((window) => applications[window.appId].minimum.width));
  const tallest = Math.max(...visible.map((window) => applications[window.appId].minimum.height));
  const columns = Math.max(
    1,
    Math.min(Math.ceil(Math.sqrt(visible.length)), Math.floor(viewport.width / widest)),
  );
  const rows = Math.ceil(visible.length / columns);
  const tiled = layout === "tile" && viewport.height / rows >= tallest;
  const edge = (index: number, count: number, total: number) => Math.floor((index * total) / count);

  return {
    ...state,
    shown: [],
    windows: state.windows.map((window) => {
      const index = visible.findIndex((entry) => entry.id === window.id);
      if (index < 0) return window;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const bounds = tiled
        ? {
            x: edge(column, columns, viewport.width),
            y: edge(row, rows, viewport.height),
            width:
              edge(column + 1, columns, viewport.width) - edge(column, columns, viewport.width),
            height: edge(row + 1, rows, viewport.height) - edge(row, rows, viewport.height),
          }
        : defaultBounds(window.appId, viewport, (index % 8) * 24);
      return {
        ...window,
        mode: "normal",
        restoreMode: "normal",
        snapped: undefined,
        unsnappedBounds: undefined,
        bounds: constrainBounds(bounds, viewport, window.appId),
      };
    }),
  };
}

function showDesktop(state: DesktopState): DesktopState {
  const anyVisible = state.windows.some((window) => window.mode !== "minimized");
  if (state.shown.length > 0 && !anyVisible) {
    const windows = state.windows.map((window) =>
      state.shown.includes(window.id) ? { ...window, mode: window.restoreMode } : window,
    );
    return { ...state, windows, active: topVisible(windows), shown: [] };
  }
  return {
    ...state,
    active: null,
    shown: state.windows.filter((window) => window.mode !== "minimized").map((window) => window.id),
    windows: state.windows.map((window) =>
      window.mode === "minimized"
        ? window
        : { ...window, restoreMode: window.mode, mode: "minimized" },
    ),
  };
}

function reset(state: DesktopState): DesktopState {
  return {
    ...state,
    shown: [],
    active: state.windows.at(-1)?.id ?? null,
    windows: state.windows.map((window, index) => ({
      ...window,
      mode: "maximized",
      restoreMode: "maximized",
      snapped: undefined,
      unsnappedBounds: undefined,
      bounds: defaultBounds(window.appId, state.viewport, index * 16),
    })),
  };
}

function snap(state: DesktopState, target: DesktopWindow, side: SnapSide): DesktopState {
  if (!canSnap(state.viewport, target.appId)) return state;
  return raise(state, {
    ...target,
    mode: "normal",
    restoreMode: "normal",
    snapped: side,
    unsnappedBounds: target.unsnappedBounds ?? target.bounds,
    bounds: snapBounds(state.viewport, side),
  });
}

function restore(state: DesktopState, target: DesktopWindow): DesktopState {
  if (target.mode === "minimized") {
    return raise(state, { ...target, mode: target.restoreMode, notification: undefined });
  }
  if (target.snapped) {
    return raise(state, {
      ...target,
      mode: "normal",
      snapped: undefined,
      unsnappedBounds: undefined,
      bounds: constrainBounds(
        target.unsnappedBounds ?? target.bounds,
        state.viewport,
        target.appId,
      ),
    });
  }
  return raise(state, {
    ...target,
    mode: "normal",
    restoreMode: "normal",
    notification: undefined,
  });
}

function minimize(state: DesktopState, target: DesktopWindow): DesktopState {
  const restoreMode = target.mode === "minimized" ? target.restoreMode : target.mode;
  const windows = state.windows.map((window) =>
    window.id === target.id ? { ...target, mode: "minimized" as const, restoreMode } : window,
  );
  return {
    ...state,
    windows,
    active: state.active === target.id ? topVisible(windows) : state.active,
    shown: [],
  };
}

function toggleMaximize(state: DesktopState, target: DesktopWindow): DesktopState {
  const maximized = target.mode === "maximized";
  return raise(state, {
    ...target,
    mode: maximized ? "normal" : "maximized",
    restoreMode: maximized ? "normal" : "maximized",
    snapped: undefined,
    unsnappedBounds: undefined,
  });
}

function activate(state: DesktopState, target: DesktopWindow): DesktopState {
  const mode = target.mode === "minimized" ? target.restoreMode : target.mode;
  return raise(state, { ...target, mode, notification: undefined });
}

export function reduceWindows(state: DesktopState, action: WindowAction): DesktopState {
  switch (action.type) {
    case "clear":
      return { ...state, windows: [], active: null, shown: [] };
    case "viewport": {
      const viewport = {
        width: Math.max(1, action.viewport.width),
        height: Math.max(1, action.viewport.height),
      };
      return {
        ...state,
        viewport,
        windows: state.windows.map((window) => ({
          ...window,
          bounds:
            window.snapped && canSnap(viewport, window.appId)
              ? snapBounds(viewport, window.snapped)
              : constrainBounds(window.bounds, viewport, window.appId),
        })),
      };
    }
    case "arrange":
      return arrange(state, action.layout);
    case "reset":
      return reset(state);
    case "show-desktop":
      return showDesktop(state);
    case "open":
      return open(state, action);
    default:
      break;
  }

  const target = state.windows.find((window) => window.id === action.id);
  if (!target) return state;

  switch (action.type) {
    case "navigate":
      return replace(state, target.id, { href: action.href });
    case "title":
      return target.title === action.title
        ? state
        : replace(state, target.id, { title: action.title });
    case "notification":
      return replace(state, target.id, {
        notification: action.unread ? (target.notification ?? 0) + 1 : undefined,
      });
    case "attention":
      return target.attention === action.attention
        ? state
        : replace(state, target.id, { attention: action.attention });
    case "close": {
      const windows = state.windows.filter((window) => window.id !== target.id);
      return {
        ...state,
        windows,
        active: state.active === target.id ? topVisible(windows) : state.active,
        shown: state.shown.filter((id) => id !== target.id),
      };
    }
    case "snap":
      return snap(state, target, action.side);
    case "bounds":
      return replace(state, target.id, {
        snapped: undefined,
        unsnappedBounds: undefined,
        bounds: constrainBounds(action.bounds, state.viewport, target.appId),
      });
    case "restore":
      return restore(state, target);
    case "maximize":
      return toggleMaximize(state, target);
    case "minimize":
      return minimize(state, target);
    case "activate":
      return activate(state, target);
  }
}

function isBounds(value: unknown): value is Bounds {
  if (!value || typeof value !== "object") return false;
  const { x, y, width, height } = value as Record<string, unknown>;
  return [x, y, width, height].every(
    (entry) => typeof entry === "number" && Number.isFinite(entry),
  );
}

export function readGeometry(): Partial<Record<AppId, Bounds>> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(layoutKey) ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const result: Partial<Record<AppId, Bounds>> = {};
    for (const [id, value] of Object.entries(data)) {
      if (Object.hasOwn(applications, id) && id !== "compose" && isBounds(value)) {
        result[id as AppId] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeGeometry(state: DesktopState): void {
  const entries = state.windows
    .filter((window) => window.appId !== "compose")
    .map((window) => [
      window.appId,
      window.snapped ? (window.unsnappedBounds ?? window.bounds) : window.bounds,
    ]);
  try {
    localStorage.setItem(layoutKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    return;
  }
}
