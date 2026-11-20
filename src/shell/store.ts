import { create } from "zustand";
import { resolveApplication, windowIdFor, type AppLocation } from "@/lib/desktop/registry";
import {
  initialDesktop,
  reduceWindows,
  type DesktopState,
  type WindowAction,
} from "@/lib/desktop/windows";

type DesktopStore = DesktopState & {
  dispatch: (action: WindowAction) => void;
};

export const useDesktop = create<DesktopStore>((set) => ({
  ...initialDesktop(),
  dispatch: (action) => set((state) => reduceWindows(state, action)),
}));

export const navigationGuards = new Map<string, () => Promise<void>>();

export async function runNavigationGuards(id: string): Promise<void> {
  await navigationGuards.get(id)?.();
}

export function openLocation(location: AppLocation, background = false): void {
  useDesktop.getState().dispatch({ type: "open", location, background });
}

export async function openHref(href: string, background = false): Promise<void> {
  const location = resolveApplication(href);
  if (!location) return;
  const { windows, dispatch } = useDesktop.getState();
  const id = windowIdFor(location);
  const existing = windows.find((window) => window.id === id);
  if (existing && existing.href !== location.href) {
    await runNavigationGuards(id);
    dispatch({ type: "navigate", id, href: location.href });
  }
  dispatch({ type: "open", location, background });
}

export async function navigateWindow(id: string, href: string): Promise<void> {
  const target = useDesktop.getState().windows.find((window) => window.id === id);
  if (!target || target.href === href) return;
  await runNavigationGuards(id);
  useDesktop.getState().dispatch({ type: "navigate", id, href });
}
