import { MailApplication } from "@/features/mail/webmail";
import { useWindow } from "@/shell/window-context";

export default function MailApp() {
  const { href } = useWindow();
  return <MailApplication location={href} desktop />;
}
