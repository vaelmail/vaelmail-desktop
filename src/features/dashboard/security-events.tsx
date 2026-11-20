import { useSession } from "@/app/session";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SirenIcon } from "@phosphor-icons/react";
import { Button } from "@/ui/controls";
import { ApiError } from "@/lib/mail/client";
import { panicLock, securityEvents, type SecurityEvent } from "@/lib/encryption/api";
import { saveOpenDrafts } from "@/lib/workspace-navigation";
import { AccountSection, InlineError } from "./ui";

const dateTimeLabel = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  })
    .format(new Date(value))
    .toLowerCase() + " utc";

function text(value: unknown) {
  return typeof value === "string" && value.length <= 40 ? value : "";
}

function eventLabel(event: SecurityEvent) {
  const d = event.data || {};
  switch (event.kind) {
    case "new_device_sign_in": {
      const device = [text(d.browser), text(d.os)].filter(Boolean).join(" on ");
      const network = d.onion === true ? " over onion" : d.i2p === true ? " over i2p" : "";
      return "new sign-in" + (device ? " from " + device : "") + network;
    }
    case "panic_lock":
      return "panic lock: every session and app credential was revoked";
    case "session_revoked":
    case "revoke":
      return "a session was signed out from a sign-in alert";
    case "mailbox_encryption_enabled":
      return "encrypted mailbox turned on";
    case "mailbox_key_changed":
      return "mailbox key changed";
    case "mailbox_encryption_disabled":
      return d.cancelled === true
        ? "encrypted mailbox cancelled while encrypting"
        : "encrypted mailbox turned off";
    default:
      return event.kind.replace(/[_-]+/g, " ");
  }
}

export function SecurityEvents() {
  const events = useQuery({
    queryKey: ["security-events"],
    queryFn: ({ signal }) => securityEvents(signal),
    retry: false,
  });
  if (events.error instanceof ApiError && events.error.status === 404) return null;
  return (
    <AccountSection
      title="recent security events"
      id="setting-security-events"
      description="new sign-ins and other security changes from the last 90 days. new devices also get an email alert."
    >
      {events.isPending && (
        <p className="da-muted" role="status">
          loading security events…
        </p>
      )}
      {events.error && (
        <>
          <InlineError message="security events could not be loaded." />
          <Button onClick={() => void events.refetch()}>retry</Button>
        </>
      )}
      {events.data && !events.data.length && (
        <p className="da-empty-message">no security events yet.</p>
      )}
      {!!events.data?.length && (
        <ul className="da-activity da-security-events">
          {events.data.slice(0, 20).map((event, i) => (
            <li key={event.id || event.kind + event.createdAt + i}>
              <span>{eventLabel(event)}</span>
              <time dateTime={event.createdAt}>{dateTimeLabel(event.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </AccountSection>
  );
}

export function PanicLock() {
  const [confirming, setConfirming] = useState(false),
    [understood, setUnderstood] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useId();
  return (
    <AccountSection
      title="panic lock"
      id="setting-panic-lock"
      description="if you think someone else is in your account, lock everything at once."
      danger
    >
      <div className="da-setting-row">
        <div>
          <h3>lock everything now</h3>
          <p>
            signs out every browser including this one, revokes all mail app credentials,
            disconnects telegram and VaelMask, and locks your encrypted mailbox. you sign in again
            with your account number.
          </p>
        </div>
        {!confirming && (
          <Button
            danger
            aria-expanded={false}
            aria-controls={id + "-confirm"}
            onClick={() => {
              setConfirming(true);
              setUnderstood(false);
              setError("");
            }}
          >
            <SirenIcon size={16} aria-hidden />
            panic lock
          </Button>
        )}
      </div>
      {confirming && (
        <div
          className="da-panic-confirm"
          id={id + "-confirm"}
          role="group"
          aria-label="confirm panic lock"
        >
          <label className="da-checkbox">
            <input
              type="checkbox"
              checked={understood}
              disabled={busy}
              onChange={(e) => setUnderstood(e.target.checked)}
              autoFocus
            />
            i understand that every session, including this one, is signed out and every app
            credential stops working
          </label>
          <InlineError message={error} />
          <div className="da-inline-actions">
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              cancel
            </Button>
            <Button
              danger
              busy={busy}
              disabled={!understood}
              onClick={() => {
                setBusy(true);
                setError("");
                void (async () => {
                  try {
                    await saveOpenDrafts().catch(() => {});
                    await panicLock();
                    void useSession.getState().signOut();
                  } catch (e) {
                    setBusy(false);
                    setError(
                      (e as Error).message ||
                        "the panic lock did not complete. try again, or sign out and rotate your account number.",
                    );
                  }
                })();
              }}
            >
              lock everything now
            </Button>
          </div>
        </div>
      )}
    </AccountSection>
  );
}
