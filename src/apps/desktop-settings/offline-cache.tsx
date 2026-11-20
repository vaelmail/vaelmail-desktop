import { useEffect, useState } from "react";
import { toast } from "sonner";
import { bridge } from "@/lib/bridge";
import { Confirm } from "@/ui/controls";
import { Button } from "@/ui/controls";
import { SettingRow, SwitchRow } from "@/ui/setting-row";
import { useDesktopSettings } from "./use-desktop-settings";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflineCacheSection() {
  const { settings, update } = useDesktopSettings();
  const [size, setSize] = useState(0);
  const [keychain, setKeychain] = useState(true);

  useEffect(() => {
    void bridge.cache
      .size()
      .then(setSize)
      .catch(() => undefined);
    void bridge.desktop
      .info()
      .then((info) => setKeychain(info.keychain))
      .catch(() => undefined);
  }, []);

  if (!settings) return null;

  return (
    <>
      <SwitchRow
        title="offline mail cache"
        description={
          keychain
            ? "keep recent mail in an encrypted file so VaelMail opens instantly and works read-only without a connection."
            : "your system has no secure key storage, so the offline cache is unavailable."
        }
        checked={settings.cache.enabled && keychain}
        disabled={!keychain}
        onChange={(enabled) =>
          void update((current) => ({ ...current, cache: { ...current.cache, enabled } }))
        }
      />
      <SwitchRow
        title="cache encrypted mailboxes"
        description="by default an encrypted mailbox is never written to disk. enable this to keep it cached, protected by the system keychain."
        checked={settings.cache.encryptedMailboxes}
        disabled={!settings.cache.enabled || !keychain}
        onChange={(encryptedMailboxes) =>
          void update((current) => ({
            ...current,
            cache: { ...current.cache, encryptedMailboxes },
          }))
        }
      />
      <SettingRow title="cache size" description={`${formatSize(size)} stored on this device.`}>
        <Confirm
          title="clear the offline cache?"
          description="saved mail on this device is deleted. it is downloaded again when you are online."
          trigger={(open) => <Button onClick={open}>clear cache</Button>}
          action={async () => {
            await bridge.cache.clear();
            setSize(await bridge.cache.size());
            toast.success("offline cache cleared");
          }}
        />
      </SettingRow>
    </>
  );
}
