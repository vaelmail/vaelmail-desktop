import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRightIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { bridge, BridgeError } from "@/lib/bridge";
import type { SessionEndReason } from "@/lib/bridge/events";
import type { SessionOutcome } from "@/lib/bridge/session";
import { RetroButton, RetroField, RetroInput, RetroPanel, RetroWindow } from "@/ui/retro98";
import { Wallpaper } from "@/shell/wallpaper";
import { useSession } from "../session";
import { PasskeyStep } from "./passkey-step";

type Step = "key" | "totp" | "recovery" | "passkey";

const notices: Record<SessionEndReason, string> = {
  expired: "your session expired. sign in again to continue.",
  revoked: "this device was signed out. sign in again to continue.",
  signedOut: "you signed out.",
};

function rejection(outcome: { status: number; code: string }): string {
  if (outcome.status === 429) return "too many attempts. wait a little before trying again.";
  if (outcome.code === "verification_expired") return "verification expired. start again.";
  if (outcome.code === "passkey_declined") return "the request was declined in the browser.";
  if (outcome.status === 404)
    return "passkey sign-in isn't available right now. use another method.";
  if (outcome.status >= 500) return "the account service is unavailable. try again shortly.";
  return "the number or verification wasn't accepted. check it and try again.";
}

function failure(error: unknown): string {
  if (error instanceof BridgeError) {
    if (error.failure.kind === "offline") return "you appear to be offline. check your connection.";
    if (error.failure.kind === "challenge") {
      return `verifying traffic. try again in ${error.failure.retryAfter} seconds.`;
    }
  }
  return "could not sign in. try again.";
}

export function SignIn() {
  const notice = useSession((state) => state.notice);
  const signedIn = useSession((state) => state.signedIn);
  const [step, setStep] = useState<Step>("key");
  const [key, setKey] = useState("");
  const [factor, setFactor] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), [step]);

  const settle = (outcome: SessionOutcome) => {
    if (outcome.kind === "signedIn") {
      signedIn();
      return;
    }
    if (outcome.kind === "rejected") {
      setError(rejection(outcome));
      return;
    }
    if (outcome.kind === "waiting") return;
    setMethods(outcome.methods);
    setFactor("");
    if (outcome.methods.includes("totp")) setStep("totp");
    else if (outcome.methods.includes("passkey")) setStep("passkey");
    else setStep("recovery");
  };

  const choose = (next: Step) => {
    setStep(next);
    setFactor("");
    setError("");
  };

  const run = async (work: () => Promise<SessionOutcome>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      settle(await work());
    } catch (cause) {
      setError(failure(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitKey = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[0-9]{16}$/.test(key)) {
      setError("enter your 16-digit account number.");
      return;
    }
    void run(async () => {
      const outcome = await bridge.session.start(key);
      setKey("");
      return outcome;
    });
  };

  const submitFactor = (event: FormEvent) => {
    event.preventDefault();
    void run(() => bridge.session.finish(factor.trim()));
  };

  const restart = () => {
    setStep("key");
    setFactor("");
    setError("");
  };

  const register = () => void bridge.files.openExternal("https://vaelmail.com/register");

  return (
    <div className="v98-desktop-shell vd-signin-shell">
      <div className="v98-desktop-area">
        <Wallpaper />
        <div className="vd-signin-center">
          <RetroWindow title="Sign in to VaelMail" className="vd-signin-window">
            <div className="vd-signin-body">
              <h1 className="vd-signin-heading">sign in</h1>
              {notice && step === "key" && (
                <RetroPanel role="status" className="vd-signin-notice">
                  {notices[notice]}
                </RetroPanel>
              )}
              {step === "key" ? (
                <form onSubmit={submitKey} noValidate aria-busy={busy}>
                  <RetroField label="account number" description="your 16-digit account number">
                    {(control) => (
                      <div className="vd-key-row">
                        <RetroInput
                          {...control}
                          ref={field}
                          name="accountKey"
                          type={revealed ? "text" : "password"}
                          inputMode="numeric"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={16}
                          value={key}
                          disabled={busy}
                          onChange={(event) => {
                            setKey(event.target.value);
                            setError("");
                          }}
                        />
                        <RetroButton
                          aria-label={revealed ? "hide account number" : "show account number"}
                          aria-pressed={revealed}
                          disabled={busy}
                          onClick={() => setRevealed((current) => !current)}
                        >
                          {revealed ? (
                            <EyeSlashIcon size={16} aria-hidden />
                          ) : (
                            <EyeIcon size={16} aria-hidden />
                          )}
                        </RetroButton>
                      </div>
                    )}
                  </RetroField>
                  {error && (
                    <p className="v98-field-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="vd-signin-actions">
                    <RetroButton type="submit" variant="primary" busy={busy}>
                      {busy ? "checking…" : "sign in"}
                    </RetroButton>
                    <RetroButton onClick={register}>
                      create account <ArrowUpRightIcon size={14} aria-hidden />
                    </RetroButton>
                  </div>
                  <p className="v98-field-description">
                    a lost account number cannot be recovered. recovery codes only replace your
                    second factor.
                  </p>
                </form>
              ) : step === "passkey" ? (
                <PasskeyStep
                  onSignedIn={signedIn}
                  onRecovery={() => choose("recovery")}
                  onTotp={methods.includes("totp") ? () => choose("totp") : undefined}
                  onRestart={restart}
                  describe={rejection}
                />
              ) : (
                <form onSubmit={submitFactor} noValidate aria-busy={busy}>
                  <RetroField
                    label={step === "totp" ? "authenticator code" : "recovery code"}
                    description={
                      step === "totp"
                        ? "enter the six-digit code from your authenticator app."
                        : "enter an unused saved recovery code. each code works once."
                    }
                  >
                    {(control) => (
                      <RetroInput
                        {...control}
                        ref={field}
                        value={factor}
                        disabled={busy}
                        inputMode={step === "totp" ? "numeric" : "text"}
                        autoComplete="one-time-code"
                        spellCheck={false}
                        maxLength={step === "totp" ? 6 : 80}
                        onChange={(event) => {
                          setFactor(event.target.value);
                          setError("");
                        }}
                      />
                    )}
                  </RetroField>
                  {error && (
                    <p className="v98-field-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="vd-signin-actions">
                    <RetroButton
                      type="submit"
                      variant="primary"
                      busy={busy}
                      disabled={step === "totp" ? !/^\d{6}$/.test(factor) : factor.trim() === ""}
                    >
                      {busy ? "verifying…" : "verify & sign in"}
                    </RetroButton>
                    {step === "totp" && (
                      <RetroButton disabled={busy} onClick={() => choose("recovery")}>
                        use a recovery code
                      </RetroButton>
                    )}
                    {step === "recovery" && methods.includes("totp") && (
                      <RetroButton disabled={busy} onClick={() => choose("totp")}>
                        use authenticator
                      </RetroButton>
                    )}
                    {methods.includes("passkey") && (
                      <RetroButton disabled={busy} onClick={() => choose("passkey")}>
                        use passkey
                      </RetroButton>
                    )}
                    <RetroButton disabled={busy} onClick={restart}>
                      start over
                    </RetroButton>
                  </div>
                </form>
              )}
            </div>
          </RetroWindow>
        </div>
      </div>
    </div>
  );
}
