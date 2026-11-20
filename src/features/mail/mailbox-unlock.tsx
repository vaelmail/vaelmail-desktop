import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeIcon, EyeSlashIcon, LockSimpleIcon, XIcon } from "@phosphor-icons/react";
import { ApiError } from "@/lib/mail/client";
import { unlockMailbox } from "@/lib/encryption/api";
import { dismissUnlockPrompt, openUnlockPrompt, useMailboxLock } from "@/lib/encryption/lock-state";
import { normalizeMailboxKey } from "@/lib/encryption/mailbox-key";
import { Button } from "@/ui/controls";

export function MailboxUnlock() {
  const locked = useMailboxLock((s) => s.locked),
    prompt = useMailboxLock((s) => s.prompt);
  const client = useQueryClient();
  const [key, setKey] = useState(""),
    [visible, setVisible] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (prompt) input.current?.focus();
  }, [prompt]);
  const dismiss = () => {
    setKey("");
    setVisible(false);
    setError("");
    dismissUnlockPrompt();
  };
  if (!locked) return null;
  if (!prompt)
    return (
      <div className="wm-unlock-pill" role="status">
        <LockSimpleIcon size={16} aria-hidden />
        <span>mailbox locked</span>
        <Button onClick={openUnlockPrompt}>unlock</Button>
      </div>
    );
  const submit = async () => {
    if (busy) return;
    const normalized = normalizeMailboxKey(key);
    if (!normalized) {
      setKey("");
      setError(
        "that is not a mailbox key. it has 32 letters and digits, usually written in 8 groups of 4.",
      );
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await unlockMailbox(normalized);
      setKey("");
      toast.success("mailbox unlocked");
      await client.invalidateQueries();
    } catch (e) {
      setKey("");
      setError(
        e instanceof ApiError && e.detail.code === "mailbox_key_invalid"
          ? "that key did not unlock your mailbox. check it and try again."
          : e instanceof ApiError && e.status === 429
            ? "too many attempts. wait 15 minutes, then try again."
            : "the mailbox could not be unlocked. try again.",
      );
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="wm-unlock-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={id + "-title"}
      aria-describedby={id + "-help"}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          dismiss();
        }
      }}
    >
      <div className="wm-unlock-heading">
        <LockSimpleIcon size={18} aria-hidden />
        <h2 id={id + "-title"}>unlock your mailbox</h2>
        <button
          type="button"
          className="wm-unlock-close"
          aria-label="close unlock prompt"
          disabled={busy}
          onClick={dismiss}
        >
          <XIcon size={16} />
        </button>
      </div>
      <p id={id + "-help"} className="wm-muted">
        your mail is stored encrypted with a key only you hold. enter your mailbox key to read it in
        this browser session.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={id + "-key"}>mailbox key</label>
        <div className="wm-unlock-input">
          <input
            ref={input}
            id={id + "-key"}
            name="mailbox-key"
            type={visible ? "text" : "password"}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={80}
            placeholder="XXXX-XXXX-XXXX-…"
            value={key}
            disabled={busy}
            aria-invalid={!!error}
            onChange={(e) => {
              setKey(e.target.value);
              if (error) setError("");
            }}
            data-sensitive
          />
          <button
            type="button"
            className="wm-unlock-reveal"
            aria-label={visible ? "hide mailbox key" : "show mailbox key"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
        <p className="wm-field-help">spaces, dashes and lower-case letters are fine.</p>
        {error && (
          <p className="wm-unlock-error" role="alert">
            {error}
          </p>
        )}
        <div className="wm-modal-actions">
          <Button disabled={busy} onClick={dismiss}>
            not now
          </Button>
          <Button primary busy={busy} type="submit" disabled={!key.trim()}>
            unlock
          </Button>
        </div>
      </form>
    </div>
  );
}
