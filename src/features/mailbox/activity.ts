import { useEffect } from "react";
import { bridge } from "@/lib/bridge";

const interval = 60_000;

export function useActivityPing(generation: number): void {
  useEffect(() => {
    let last = 0;
    const ping = (event: Event) => {
      if (!event.isTrusted || document.hidden || Date.now() - last < interval) return;
      last = Date.now();
      void bridge
        .api("/api/account", "POST", { action: "activity" }, generation)
        .catch(() => undefined);
    };
    const options = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", ping, options);
    document.addEventListener("keydown", ping, options);
    document.addEventListener("wheel", ping, options);
    return () => {
      document.removeEventListener("pointerdown", ping, options);
      document.removeEventListener("keydown", ping, options);
      document.removeEventListener("wheel", ping, options);
    };
  }, [generation]);
}
