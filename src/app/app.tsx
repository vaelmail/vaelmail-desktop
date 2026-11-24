import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { bridge } from "@/lib/bridge";
import { RetroThemeScope } from "@/ui/retro98";
import { useTheme } from "@/lib/theme";
import { MailboxProvider } from "@/features/mailbox/provider";
import { OutboxRunner } from "@/features/mailbox/outbox";
import { watchVerification } from "@/features/verification/store";
import { watchErrors } from "@/lib/bridge/report";
import { ViewBoundary } from "@/shell/view-boundary";
import { VerificationDialog } from "@/features/verification/verification-dialog";
import { AppShell } from "@/shell/app-shell";
import { useDesktop } from "@/shell/store";
import { PasskeyPrompt } from "@/shell/passkey-prompt";
import { TitleBar } from "@/shell/title-bar";
import { ResizeEdges } from "@/shell/window-controls";
import { BootScreen } from "./boot";
import { interceptExternalLinks } from "./external-links";
import { SignIn } from "./sign-in/sign-in";
import { useSession, watchSession } from "./session";

function Bare({ children }: { children: ReactNode }) {
  const resolved = useTheme((state) => state.resolved);
  return (
    <RetroThemeScope theme={resolved === "light" ? "light" : "graphite"}>
      <div className="vx-app vx-bare">
        <ResizeEdges />
        <TitleBar title="" />
        <div className="vx-bare-body">{children}</div>
        <VerificationDialog />
      </div>
    </RetroThemeScope>
  );
}

export function App() {
  const phase = useSession((state) => state.phase);
  const refresh = useSession((state) => state.refresh);
  const signOut = useSession((state) => state.signOut);
  const resolved = useTheme((state) => state.resolved);

  useEffect(() => {
    const stop = watchSession();
    const stopVerification = watchVerification();
    const stopErrors = watchErrors();
    void refresh().finally(() => void bridge.desktop.ready().catch(() => undefined));
    return () => {
      stop();
      stopVerification();
      stopErrors();
    };
  }, [refresh]);

  useEffect(() => interceptExternalLinks(), []);

  useEffect(() => {
    if (phase === "signedOut") useDesktop.getState().dispatch({ type: "clear" });
  }, [phase]);

  if (phase === "loading") {
    return (
      <Bare>
        <BootScreen />
      </Bare>
    );
  }
  if (phase === "signedOut") {
    return (
      <Bare>
        <SignIn />
      </Bare>
    );
  }
  return (
    <MailboxProvider>
      <ViewBoundary label="VaelMail">
        <AppShell onSignOut={() => void signOut()} />
      </ViewBoundary>
      <VerificationDialog />
      <PasskeyPrompt />
      <OutboxRunner />
      <Toaster position="bottom-left" theme={resolved} />
    </MailboxProvider>
  );
}
