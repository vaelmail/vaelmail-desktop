import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { bridge } from "@/lib/bridge";
import type { DesktopSettings } from "@/lib/bridge/desktop";

const key = ["desktop-settings"];

export function useDesktopSettings() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => bridge.desktop.settings(),
    networkMode: "always",
  });

  const update = useCallback(
    async (change: (current: DesktopSettings) => DesktopSettings) => {
      const current = client.getQueryData<DesktopSettings>(key);
      if (!current) return;
      const next = change(current);
      client.setQueryData(key, next);
      try {
        await bridge.desktop.saveSettings(next);
      } catch (failure) {
        client.setQueryData(key, current);
        toast.error(failure instanceof Error ? failure.message : "could not save the setting");
      }
    },
    [client],
  );

  return { settings: query.data, update, error: query.error };
}
