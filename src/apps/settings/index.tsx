import { SettingsPanel } from "@/features/mail/settings";
import { useWindowLocation } from "@/shell/window-context";

export default function SettingsApp() {
  const { pathname, searchParams } = useWindowLocation();
  const section = pathname.split("/")[3] || "appearance";
  return (
    <div className="wm v98-resource-app">
      <SettingsPanel section={section} controlTarget={searchParams.get("control")} />
    </div>
  );
}
