import { useEffect, useState } from "react";
import { toast } from "sonner";
import { bridge } from "@/lib/bridge";
import type { ProxyMode } from "@/lib/bridge/desktop";
import { Button } from "@/ui/controls";
import { VaelSelect } from "@/ui/select";
import { SettingRow } from "@/ui/setting-row";
import { useDesktopSettings } from "./use-desktop-settings";

export function NetworkSection() {
  const { settings, update } = useDesktopSettings();
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settings) setUrl(settings.proxy.url);
  }, [settings]);

  if (!settings) return null;

  const test = async () => {
    setTesting(true);
    try {
      const result = await bridge.desktop.testConnection();
      if (result.ok) toast.success("vaelmail.com is reachable");
      else toast.error("vaelmail.com could not be reached");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SettingRow
        title="connection"
        description="use the system proxy, connect directly, or route through your own proxy such as Tor (socks5h://127.0.0.1:9050)."
      >
        <VaelSelect
          value={settings.proxy.mode}
          onChange={(event) =>
            void update((current) => ({
              ...current,
              proxy: { ...current.proxy, mode: event.target.value as ProxyMode },
            }))
          }
        >
          <option value="system">system settings</option>
          <option value="none">direct connection</option>
          <option value="manual">custom proxy</option>
        </VaelSelect>
      </SettingRow>
      {settings.proxy.mode === "manual" && (
        <SettingRow
          title="proxy address"
          description="http, https or socks5h address of your proxy."
        >
          <input
            value={url}
            placeholder="socks5h://127.0.0.1:9050"
            spellCheck={false}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={() =>
              void update((current) => ({ ...current, proxy: { ...current.proxy, url } }))
            }
          />
        </SettingRow>
      )}
      <SettingRow title="test connection" description="check that VaelMail can reach the service.">
        <Button busy={testing} onClick={() => void test()}>
          test
        </Button>
      </SettingRow>
    </>
  );
}
