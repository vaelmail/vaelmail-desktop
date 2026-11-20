import { useEffect, useMemo, useState } from "react";
import {
  DownloadSimpleIcon,
  LockSimpleIcon,
  SealCheckIcon,
  SealWarningIcon,
} from "@phosphor-icons/react";
import { ApiError } from "@/lib/mail/client";
import { formatBytes, type Message } from "@/lib/mail/types";
import { messageSource } from "@/lib/encryption/api";
import { openUnlockPrompt, useMailboxLock } from "@/lib/encryption/lock-state";
import { detectPgp } from "@/lib/encryption/pgp-mime";
import { cachedDecryption, decryptStoredMessage, type DecryptResult } from "@/lib/encryption/pgp";
import { sanitizeDecryptedHtml } from "@/lib/encryption/sanitize";
import { useMail } from "@/features/mailbox/context";
import { MessageFrame } from "./message-frame";
import { Button } from "@/ui/controls";

type State =
  | { status: "decrypting" }
  | { status: "done"; result: DecryptResult }
  | { status: "locked" }
  | { status: "failed"; message: string };

const signatureCopy: Record<DecryptResult["signature"], string> = {
  valid: "signed by the sender · signature verified",
  invalid: "signature does not match the sender's key",
  "unknown-key": "signed, but the sender's key is unknown",
  unsigned: "not signed",
};

export function PgpMessage({
  message,
  index,
  light,
}: {
  message: Message;
  index: number;
  light: boolean;
}) {
  const { data } = useMail();
  const unlocks = useMailboxLock((s) => s.unlocks),
    locks = useMailboxLock((s) => s.locks);
  const kind = detectPgp({ contentType: message.mime?.contentType, text: message.text })!;
  const cached = cachedDecryption(message.id);
  const [state, setState] = useState<State>(
    cached ? { status: "done", result: cached } : { status: "decrypting" },
  );
  const [attempt, setAttempt] = useState(0);
  const [plain, setPlain] = useState(false);
  const generation = data.mailbox.generation;
  const [seen, setSeen] = useState({ locks, unlocks });
  if (seen.locks !== locks || seen.unlocks !== unlocks) {
    setSeen({ locks, unlocks });
    if (seen.unlocks !== unlocks) setState({ status: "decrypting" });
    else if (state.status === "done") setState({ status: "locked" });
  }
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        let source: Uint8Array | null = null;
        try {
          source = await messageSource(message.id);
        } catch (e) {
          if (e instanceof ApiError && e.status === 423) throw e;
          if (abort.signal.aborted) return;
          if (kind === "pgp-mime") throw e;
        }
        const result = await decryptStoredMessage({
          messageId: message.id,
          kind,
          source,
          fallbackText: message.text,
          senderEmail: message.direction === "incoming" ? message.from.email : undefined,
        });
        if (!abort.signal.aborted) setState({ status: "done", result });
      } catch (e) {
        if (abort.signal.aborted) return;
        if (e instanceof ApiError && (e.status === 423 || e.detail.code === "mailbox_locked"))
          setState({ status: "locked" });
        else
          setState({
            status: "failed",
            message:
              e instanceof ApiError
                ? e.message || "the message could not be loaded"
                : "this message could not be decrypted with your OpenPGP key. it may have been encrypted to a different key.",
          });
      }
    })();
    return () => abort.abort();
  }, [
    message.id,
    message.text,
    message.direction,
    message.from.email,
    kind,
    generation,
    unlocks,
    attempt,
  ]);
  const result = state.status === "done" ? state.result : null;
  const html = useMemo(
    () => (result?.content.html ? sanitizeDecryptedHtml(result.content.html) : null),
    [result],
  );
  const showPlain = plain || !html;
  return (
    <div className="wm-pgp-message">
      <div className="wm-pgp-badge" role="status">
        <LockSimpleIcon size={15} aria-hidden />
        <strong>End-to-end encrypted (OpenPGP)</strong>
        {result && (
          <span
            className={
              "wm-pgp-signature " +
              (result.signature === "valid"
                ? "valid"
                : result.signature === "invalid"
                  ? "invalid"
                  : "")
            }
          >
            {result.signature === "valid" ? (
              <SealCheckIcon size={14} aria-hidden />
            ) : result.signature === "invalid" ? (
              <SealWarningIcon size={14} aria-hidden />
            ) : null}
            {signatureCopy[result.signature]}
          </span>
        )}
      </div>
      {state.status === "decrypting" && (
        <p className="wm-muted" role="status">
          decrypting in your browser…
        </p>
      )}
      {state.status === "locked" && (
        <div className="wm-pgp-state">
          <p>unlock your mailbox to decrypt this message.</p>
          <Button onClick={openUnlockPrompt}>unlock</Button>
        </div>
      )}
      {state.status === "failed" && (
        <div className="wm-pgp-state" role="alert">
          <p>{state.message}</p>
          <Button
            onClick={() => {
              setState({ status: "decrypting" });
              setAttempt((n) => n + 1);
            }}
          >
            try again
          </Button>
        </div>
      )}
      {result && (
        <>
          {result.content.protectedSubject && (
            <p className="wm-muted wm-pgp-subject">
              encrypted subject: <strong>{result.content.protectedSubject}</strong>
            </p>
          )}
          {html && (
            <div
              className="wm-message-format"
              role="group"
              aria-label={`display options for message ${index + 1}`}
            >
              <button type="button" aria-pressed={!plain} onClick={() => setPlain(false)}>
                formatted
              </button>
              <button type="button" aria-pressed={plain} onClick={() => setPlain(true)}>
                plain text
              </button>
            </div>
          )}
          {showPlain ? (
            <pre className="wm-plain-message">
              {result.content.text || "this message has no plain-text content."}
            </pre>
          ) : (
            <MessageFrame
              title={`decrypted message ${index + 1}`}
              html={html!}
              light={light}
              fontSize={data.mailbox.settings.bodySize}
            />
          )}
          {result.content.attachments.length > 0 && (
            <div className="wm-attachments" aria-label="encrypted attachments">
              {result.content.attachments.map((file, i) => (
                <button
                  type="button"
                  key={i + file.name}
                  className="wm-file"
                  onClick={() => saveDecrypted(file.name, file.bytes)}
                >
                  <span>
                    <strong>{file.name}</strong>
                    <small>{formatBytes(file.bytes.length)} · decrypted in your browser</small>
                  </span>
                  <DownloadSimpleIcon size={18} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function saveDecrypted(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/[/\\]/g, "_") || "attachment";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
