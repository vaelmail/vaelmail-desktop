import { createContext, useCallback, useContext, useMemo } from "react";
import type { AppId } from "@/lib/desktop/registry";
import { openHref, runNavigationGuards, useDesktop } from "./store";

export type WindowContextValue = {
  id: string;
  appId: AppId;
  href: string;
  instanceId: string | undefined;
};

export const WindowContext = createContext<WindowContextValue | null>(null);

export function useWindow(): WindowContextValue {
  const value = useContext(WindowContext);
  if (!value) throw new Error("WindowContext is required");
  return value;
}

export type WindowLocation = {
  pathname: string;
  search: string;
  searchParams: URLSearchParams;
  hash: string;
  href: string;
  navigate: (href: string, options?: { replace?: boolean }) => Promise<void>;
};

export function useWindowLocation(): WindowLocation {
  const { id, href } = useWindow();
  const dispatch = useDesktop((state) => state.dispatch);

  const navigate = useCallback(
    async (next: string) => {
      if (next === href) return;
      await runNavigationGuards(id);
      dispatch({ type: "navigate", id, href: next });
    },
    [dispatch, href, id],
  );

  return useMemo(() => {
    const url = new URL(href, "https://desktop.invalid");
    return {
      pathname: url.pathname,
      search: url.search,
      searchParams: url.searchParams,
      hash: url.hash,
      href,
      navigate,
    };
  }, [href, navigate]);
}

export function useOpenHref(): (href: string) => void {
  return useCallback((href: string) => {
    void openHref(href);
  }, []);
}
