import { describe, expect, it } from "vitest";
import {
  canSnap,
  constrainBounds,
  initialDesktop,
  reduceWindows,
  resizeBounds,
  snapBounds,
  type DesktopState,
  type WindowAction,
} from "@/lib/desktop/windows";

function run(...actions: WindowAction[]): DesktopState {
  return actions.reduce(reduceWindows, initialDesktop());
}

const mail = { type: "open", location: { appId: "mail", href: "/webmail/inbox" } } as const;
const settings = {
  type: "open",
  location: { appId: "settings", href: "/webmail/settings/appearance" },
} as const;

describe("opening windows", () => {
  it("opens applications maximized", () => {
    const state = run(mail);
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]?.mode).toBe("maximized");
    expect(state.active).toBe("mail");
  });

  it("focuses an existing window instead of duplicating it", () => {
    const state = run(mail, settings, mail);
    expect(state.windows.map((window) => window.id)).toEqual(["settings", "mail"]);
    expect(state.active).toBe("mail");
  });

  it("requires a draft id for compose windows", () => {
    expect(
      run({ type: "open", location: { appId: "compose", href: "/webmail/compose" } }).windows,
    ).toHaveLength(0);
    const state = run(
      { type: "open", location: { appId: "compose", href: "/webmail/compose", instanceId: "a" } },
      { type: "open", location: { appId: "compose", href: "/webmail/compose", instanceId: "b" } },
    );
    expect(state.windows.map((window) => window.id)).toEqual(["compose:a", "compose:b"]);
  });

  it("opens in the background minimized", () => {
    const state = run(mail, { ...settings, background: true });
    expect(state.windows.find((window) => window.id === "settings")?.mode).toBe("minimized");
    expect(state.active).toBe("mail");
  });
});

describe("window modes", () => {
  it("restores a maximized window to normal and back", () => {
    const restored = run(mail, { type: "maximize", id: "mail" });
    expect(restored.windows[0]?.mode).toBe("normal");
    const again = reduceWindows(restored, { type: "maximize", id: "mail" });
    expect(again.windows[0]?.mode).toBe("maximized");
  });

  it("minimizes and reactivates with the previous mode", () => {
    const minimized = run(mail, { type: "minimize", id: "mail" });
    expect(minimized.windows[0]?.mode).toBe("minimized");
    expect(minimized.active).toBeNull();
    const back = reduceWindows(minimized, { type: "activate", id: "mail" });
    expect(back.windows[0]?.mode).toBe("maximized");
    expect(back.active).toBe("mail");
  });

  it("hands focus to the next visible window when one closes", () => {
    const state = run(mail, settings, { type: "close", id: "settings" });
    expect(state.active).toBe("mail");
  });

  it("toggles show desktop", () => {
    const hidden = run(mail, settings, { type: "show-desktop" });
    expect(hidden.windows.every((window) => window.mode === "minimized")).toBe(true);
    const shown = reduceWindows(hidden, { type: "show-desktop" });
    expect(shown.windows.every((window) => window.mode === "maximized")).toBe(true);
  });

  it("snaps to a half and restores to the previous size", () => {
    const viewport = { type: "viewport", viewport: { width: 1600, height: 900 } } as const;
    const state = run(
      viewport,
      mail,
      { type: "maximize", id: "mail" },
      { type: "snap", id: "mail", side: "left" },
    );
    const snapped = state.windows[0]!;
    expect(snapped.snapped).toBe("left");
    expect(snapped.bounds).toEqual(snapBounds({ width: 1600, height: 900 }, "left"));
    const restored = reduceWindows(state, { type: "restore", id: "mail" }).windows[0]!;
    expect(restored.snapped).toBeUndefined();
    expect(restored.mode).toBe("normal");
  });

  it("does not snap on narrow viewports", () => {
    expect(canSnap({ width: 600, height: 800 }, "mail")).toBe(false);
  });

  it("tiles visible windows without overlap", () => {
    const state = run(
      { type: "viewport", viewport: { width: 1600, height: 900 } },
      mail,
      settings,
      { type: "arrange", layout: "tile" },
    );
    const [first, second] = state.windows;
    expect(first?.mode).toBe("normal");
    expect(first!.bounds.x + first!.bounds.width).toBeLessThanOrEqual(second!.bounds.x);
  });
});

describe("geometry", () => {
  it("keeps bounds inside the viewport and above the minimum size", () => {
    const bounds = constrainBounds(
      { x: -50, y: 2000, width: 10, height: 99999 },
      { width: 1000, height: 700 },
      "mail",
    );
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBeGreaterThanOrEqual(420);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(700);
  });

  it("resizes from the north-west corner without crossing the minimum", () => {
    const resized = resizeBounds(
      { x: 100, y: 100, width: 600, height: 500 },
      "nw",
      900,
      900,
      { width: 1600, height: 900 },
      "mail",
    );
    expect(resized.width).toBe(420);
    expect(resized.height).toBe(320);
  });

  it("re-fits windows when the viewport shrinks", () => {
    const state = run(
      mail,
      { type: "maximize", id: "mail" },
      { type: "viewport", viewport: { width: 900, height: 600 } },
    );
    const { bounds } = state.windows[0]!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(900);
  });
});
