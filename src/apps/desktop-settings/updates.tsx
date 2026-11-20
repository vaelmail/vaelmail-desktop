import { useEffect, useState } from "react";
import { toast } from "sonner";
import { bridge, on } from "@/lib/bridge";
import type { UpdateInfo } from "@/lib/bridge/desktop";
import { Button } from "@/ui/controls";
import { SettingRow, SwitchRow } from "@/ui/setting-row";
import { useAppInfo } from "./use-app-info";
import { useDesktopSettings } from "./use-desktop-settings";

const releases = "https://github.com/vaelmail/vaelmail-desktop/releases/latest";

export function UpdatesSection() {
  const { settings, update } = useDesktopSettings();
  const [supported, setSupported] = useState(false);
  const [available, setAvailable] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const portable = useAppInfo()?.packaged === "portable";

  useEffect(() => {
    void bridge.desktop.updates
      .supported()
      .then(setSupported)
      .catch(() => undefined);
    const listening = on("updates:progress", ({ received, total }) => {
      setProgress(total ? Math.round((received / total) * 100) : null);
    });
    return () => void listening.then((unlisten) => unlisten());
  }, []);

  if (!settings) return null;

  const check = async () => {
    setChecking(true);
    try {
      const found = await bridge.desktop.updates.check();
      setAvailable(found);
      if (!found) toast.success("you are on the latest version");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "could not check for updates");
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    setProgress(0);
    try {
      await bridge.desktop.updates.install();
    } catch (failure) {
      setProgress(null);
      toast.error(typeof failure === "string" ? failure : "the update could not be installed");
    }
  };

  return (
    <>
      <SwitchRow
        title="check for updates automatically"
        description="contacts GitHub releases for new versions. no account data is sent."
        checked={settings.updates.auto}
        disabled={!supported}
        onChange={(auto) => void update((current) => ({ ...current, updates: { auto } }))}
      />
      <SettingRow
        title="update status"
        description={
          portable
            ? "a portable copy doesn't update itself. download the newest portable build and replace this one, your data folder stays as it is."
            : !supported
              ? "updates are installed by your package manager or downloaded from GitHub for this build."
              : available
                ? `version ${available.version} is available.`
                : "check whether a newer version is available."
        }
      >
        {portable ? (
          <Button onClick={() => void bridge.files.openExternal(releases)}>open downloads</Button>
        ) : (
          <Button
            busy={checking}
            disabled={!supported || progress !== null}
            onClick={() => void check()}
          >
            check now
          </Button>
        )}
        {available && (
          <Button primary disabled={progress !== null} onClick={() => void install()}>
            {progress === null ? "install and restart" : `downloading ${progress}%`}
          </Button>
        )}
      </SettingRow>
    </>
  );
}
