import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRightIcon, FingerprintIcon } from "@phosphor-icons/react";
import { bridge } from "@/lib/bridge";
import { RetroButton, RetroPanel } from "@/ui/retro98";

type Rejection = { status: number; code: string };

type Props = {
  onSignedIn: () => void;
  onRecovery: () => void;
  onTotp: (() => void) | undefined;
  onRestart: () => void;
  describe: (rejection: Rejection) => string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "waiting"; code: string; deadline: number }
  | { kind: "failed"; message: string };

const pollInterval = 2000;

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function remaining(deadline: number) {
  const seconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PasskeyStep({ onSignedIn, onRecovery, onTotp, onRestart, describe }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [, tick] = useState(0);
  const polling = useRef(false);

  const open = async () => {
    setPhase({ kind: "opening" });
    try {
      const result = await bridge.session.passkeyStart();
      if (result.kind === "rejected") {
        setPhase({ kind: "failed", message: describe(result) });
        return;
      }
      setPhase({
        kind: "waiting",
        code: result.code,
        deadline: Date.now() + result.expiresIn * 1000,
      });
    } catch {
      setPhase({ kind: "failed", message: "the browser could not be opened. try again." });
    }
  };

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const outcome = await bridge.session.passkeyPoll();
      if (outcome.kind === "signedIn") onSignedIn();
      else if (outcome.kind === "rejected") {
        setPhase({ kind: "failed", message: describe(outcome) });
      }
    } catch {
      return;
    } finally {
      polling.current = false;
    }
  }, [describe, onSignedIn]);

  const waiting = phase.kind === "waiting";
  const deadline = waiting ? phase.deadline : 0;

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= deadline) {
        setPhase({ kind: "failed", message: "the request expired. start again." });
        return;
      }
      tick((value) => value + 1);
      void poll();
    }, pollInterval);
    window.addEventListener("focus", poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [waiting, deadline, poll]);

  useEffect(() => () => void bridge.session.passkeyCancel().catch(() => undefined), []);

  return (
    <div className="vd-passkey" aria-live="polite">
      <div className="vd-passkey-intro">
        <FingerprintIcon size={32} weight="duotone" aria-hidden />
        <p>
          passkeys belong to vaelmail.com, so your browser verifies them. we open a one-time link,
          you approve with your passkey, and this window signs in by itself.
        </p>
      </div>
      {phase.kind === "waiting" && (
        <RetroPanel className="vd-passkey-waiting">
          <span className="vd-passkey-label">check that the browser shows</span>
          <strong className="vd-passkey-code">{formatCode(phase.code)}</strong>
          <span className="vd-passkey-status">
            <span className="vd-passkey-pulse" aria-hidden />
            waiting for approval · {remaining(phase.deadline)}
          </span>
        </RetroPanel>
      )}
      {phase.kind === "failed" && (
        <p className="v98-field-error" role="alert">
          {phase.message}
        </p>
      )}
      <div className="vd-signin-actions">
        {phase.kind === "waiting" ? (
          <RetroButton onClick={() => void open()}>
            reopen browser <ArrowUpRightIcon size={14} aria-hidden />
          </RetroButton>
        ) : (
          <RetroButton
            variant="primary"
            busy={phase.kind === "opening"}
            onClick={() => void open()}
          >
            continue in browser <ArrowUpRightIcon size={14} aria-hidden />
          </RetroButton>
        )}
        {onTotp && <RetroButton onClick={onTotp}>use authenticator</RetroButton>}
        <RetroButton onClick={onRecovery}>use a recovery code</RetroButton>
        <RetroButton onClick={onRestart}>start over</RetroButton>
      </div>
    </div>
  );
}
