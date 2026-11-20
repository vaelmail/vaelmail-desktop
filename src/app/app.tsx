import { useEffect } from "react";
import { Toaster } from "sonner";
import { bridge } from "@/lib/bridge";
import { RetroThemeScope } from "@/ui/retro98";
import { useTheme } from "@/lib/theme";
import { MailboxProvider } from "@/features/mailbox/provider";
import { OutboxRunner } from "@/features/mailbox/outbox";
import { Desktop } from "@/shell/desktop";
import { useDesktop } from "@/shell/store";
import { PasskeyPrompt } from "@/shell/passkey-prompt";
import { BootScreen } from "./boot";
import { interceptExternalLinks } from "./external-links";
import { SignIn } from "./sign-in/sign-in";
import { useSession, watchSession } from "./session";

export function App() {
  const phase = useSession((state) => state.phase);
  const refresh = useSession((state) => state.refresh);
  const signOut = useSession((state) => state.signOut);
  const resolved = useTheme((state) => state.resolved);

  useEffect(() => {
    const stop = watchSession();
    void refresh().then(() => bridge.desktop.ready());
    return stop;
  }, [refresh]);

  useEffect(() => interceptExternalLinks(), []);

  useEffect(() => {
    if (phase === "signedOut") useDesktop.getState().dispatch({ type: "clear" });
  }, [phase]);

  const theme = resolved === "light" ? "light" : "graphite";

  if (phase === "loading") {
    return (
      <RetroThemeScope theme={theme}>
        <BootScreen />
      </RetroThemeScope>
    );
  }
  if (phase === "signedOut") {
    return (
      <RetroThemeScope theme={theme}>
        <SignIn />
      </RetroThemeScope>
    );
  }
  return (
    <MailboxProvider>
      <Desktop onSignOut={() => void signOut()} />
      <PasskeyPrompt />
      <OutboxRunner />
      <Toaster position="bottom-right" theme={resolved} />
    </MailboxProvider>
  );
}
