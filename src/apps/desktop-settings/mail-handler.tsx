import { toast } from "sonner";
import { bridge } from "@/lib/bridge";
import { Button } from "@/ui/controls";
import { SettingRow } from "@/ui/setting-row";
import { useAppInfo } from "./use-app-info";

const platform = navigator.userAgent.includes("Mac")
  ? "macos"
  : navigator.userAgent.includes("Windows")
    ? "windows"
    : "linux";

const descriptions = {
  macos: "open mailto: links in VaelMail. macOS may ask you to confirm the change.",
  windows: "open mailto: links in VaelMail. windows opens default apps so you can confirm it.",
  linux: "open mailto: links in VaelMail through your desktop's default applications.",
};

export function MailHandlerSection() {
  const info = useAppInfo();
  const supported = info?.mailHandler ?? true;

  return (
    <SettingRow
      title="default mail app"
      description={
        supported
          ? descriptions[platform]
          : "a portable copy can move between computers, so it doesn't register itself as the mail app."
      }
    >
      {supported && (
        <Button
          onClick={async () => {
            const registered = await bridge.desktop.registerMailHandler();
            if (registered) toast.success("VaelMail now opens mailto: links");
            else toast.error("this system could not register VaelMail as the mail app");
          }}
        >
          make VaelMail the mail app
        </Button>
      )}
    </SettingRow>
  );
}
