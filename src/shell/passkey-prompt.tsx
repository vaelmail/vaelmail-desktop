import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { FingerprintIcon, XIcon } from "@phosphor-icons/react";
import { usePasskeyPrompt } from "@/lib/bridge";
import { Button } from "@/ui/controls";

function remaining(deadline: number) {
  const seconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PasskeyPrompt() {
  const prompt = usePasskeyPrompt((state) => state.prompt);
  const cancel = usePasskeyPrompt((state) => state.cancel);
  const [, tick] = useState(0);
  const open = prompt.phase !== "idle";

  useEffect(() => {
    if (prompt.phase !== "waiting") return;
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [prompt.phase]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="wm-backdrop" />
        <Dialog.Popup className="wm-dialog vd-passkey-dialog">
          <div className="wm-modal-heading">
            <div>
              <Dialog.Title className="wm-title">confirm with your passkey</Dialog.Title>
              <Dialog.Description className="wm-muted">
                finish this in the browser window that just opened.
              </Dialog.Description>
            </div>
            <Dialog.Close className="wm-icon" aria-label="cancel passkey confirmation">
              <XIcon size={18} />
            </Dialog.Close>
          </div>
          <div className="vd-passkey" aria-live="polite">
            <div className="vd-passkey-intro">
              <FingerprintIcon size={32} weight="duotone" aria-hidden />
              <p>
                passkeys belong to vaelmail.com, so your browser checks them. approve there and this
                change continues on its own.
              </p>
            </div>
            {prompt.phase === "waiting" ? (
              <div className="vd-passkey-waiting v98-panel">
                <span className="vd-passkey-label">check that the browser shows</span>
                <strong className="vd-passkey-code">
                  {prompt.code.slice(0, 3)} {prompt.code.slice(3)}
                </strong>
                <span className="vd-passkey-status">
                  <span className="vd-passkey-pulse" aria-hidden />
                  waiting for approval · {remaining(prompt.deadline)}
                </span>
              </div>
            ) : (
              <p className="wm-muted">opening your browser…</p>
            )}
            <div className="wm-modal-actions">
              <Button onClick={cancel}>cancel</Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
