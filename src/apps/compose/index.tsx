import ComposeWindow from "@/features/mail/composer";
import { useWindow } from "@/shell/window-context";

export default function ComposeApp() {
  const { instanceId } = useWindow();
  return instanceId ? <ComposeWindow id={instanceId} /> : null;
}
