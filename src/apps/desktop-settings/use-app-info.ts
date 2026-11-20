import { useEffect, useState } from "react";
import { bridge } from "@/lib/bridge";
import type { AppInfo } from "@/lib/bridge/desktop";

export function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let active = true;
    void bridge.desktop
      .info()
      .then((value) => {
        if (active) setInfo(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return info;
}
