import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowClockwiseIcon, ShieldCheckIcon, XIcon } from "@phosphor-icons/react";
import { bridge } from "@/lib/bridge";
import { useTheme } from "@/lib/theme";
import { RetroSurface } from "@/ui/retro98";
import { useVerification } from "./store";

export function useCountdown(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function VerificationDialog() {
  const state = useVerification((store) => store.state);
  const open = useVerification((store) => store.open);
  const deadline = useVerification((store) => store.deadline);
  const setOpen = useVerification((store) => store.setOpen);
  const resolved = useTheme((store) => store.resolved);
  const left = useCountdown(deadline);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const captcha = state?.phase === "captcha" ? state : null;

  useEffect(() => {
    setSending(false);
    setCode("");
  }, [captcha?.image]);

  if (!captcha) return null;
  const total = Math.max(captcha.waitSeconds, 1);
  const progress = Math.min(1, 1 - left / Math.max(total, left, 1));

  const submit = () => {
    const value = code.trim();
    if (!value || sending) return;
    setSending(true);
    void bridge.verification.answer(value);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <RetroSurface theme={resolved === "light" ? "light" : "graphite"}>
          <Dialog.Backdrop className="vx-scrim" />
          <Dialog.Popup className="vx-sheet vx-verify" initialFocus={input}>
            <header className="vx-sheet-head">
              <span className="vx-sheet-icon" aria-hidden>
                <ShieldCheckIcon size={22} weight="duotone" />
              </span>
              <div>
                <Dialog.Title className="vx-sheet-title">Quick security check</Dialog.Title>
                <Dialog.Description className="vx-sheet-text">
                  VaelMail is under heavy traffic right now. The app continues by itself in{" "}
                  <strong>{left}s</strong>, or type the code to continue now.
                </Dialog.Description>
              </div>
              <Dialog.Close className="vx-icon-button" aria-label="Hide">
                <XIcon size={16} />
              </Dialog.Close>
            </header>
            <div className="vx-verify-body">
              <div className="vx-verify-image">
                {captcha.image ? (
                  <img
                    src={`data:image/png;base64,${captcha.image}`}
                    width={240}
                    height={84}
                    alt="Distorted code of five letters and digits"
                  />
                ) : (
                  <span className="vx-muted">No image available, waiting instead.</span>
                )}
                <button
                  type="button"
                  className="vx-icon-button"
                  aria-label="New image"
                  title="New image"
                  onClick={() => void bridge.verification.newImage()}
                >
                  <ArrowClockwiseIcon size={16} />
                </button>
              </div>
              <form
                className="vx-verify-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <input
                  ref={input}
                  className="vx-input"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  maxLength={8}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="Code from the image"
                  aria-invalid={captcha.wrong || undefined}
                  placeholder="Code"
                  disabled={!captcha.image}
                />
                <button
                  type="submit"
                  className="vx-button"
                  data-primary
                  disabled={!code.trim() || sending}
                >
                  {sending ? "Checking…" : "Continue"}
                </button>
              </form>
              {captcha.wrong && (
                <p className="vx-verify-error" role="alert">
                  That code did not match. Try the new image.
                </p>
              )}
              <div className="vx-progress" aria-hidden>
                <i style={{ transform: `scaleX(${progress})` }} />
              </div>
              <p className="vx-sheet-foot">
                Nothing about you is stored. You can hide this and keep working; the check finishes
                in the background.
              </p>
            </div>
          </Dialog.Popup>
        </RetroSurface>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function VerificationStatus() {
  const state = useVerification((store) => store.state);
  const deadline = useVerification((store) => store.deadline);
  const setOpen = useVerification((store) => store.setOpen);
  const left = useCountdown(state?.phase === "captcha" ? deadline : 0);
  if (!state) return null;
  const label =
    state.phase === "checking"
      ? "Checking connection…"
      : state.phase === "captcha"
        ? `Security check · ${left}s`
        : state.phase === "done"
          ? "Verified"
          : "Check failed, retrying";
  return (
    <button
      type="button"
      className="vx-pill"
      data-phase={state.phase}
      onClick={() => state.phase === "captcha" && setOpen(true)}
      aria-live="polite"
    >
      <span className="vx-pill-dot" aria-hidden />
      {label}
    </button>
  );
}
