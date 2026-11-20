import { useState } from "react";
import { EyeIcon } from "@phosphor-icons/react";
import type { OpenTracking } from "@/lib/mail/types";
import { mailDate } from "@/lib/mail/date";
import { useMail } from "@/features/mailbox/context";
import { Button } from "@/ui/controls";
export function TrackingBadge({ tracking }: { tracking: OpenTracking }) {
  const text = tracking.firstOpenedAt
    ? "seen"
    : tracking.state === "expired"
      ? "tracking expired"
      : tracking.state === "stopped"
        ? "tracking stopped"
        : "tracking on";
  return (
    <span
      className={`wm-tracking-badge ${tracking.firstOpenedAt ? "seen" : ""}`}
      title={
        tracking.firstOpenedAt
          ? "the tracking pixel was requested; this does not prove a person read the message"
          : "no pixel request recorded; images may be blocked"
      }
    >
      <EyeIcon size={13} />
      {text}
    </span>
  );
}
export function TrackingDetails({ tracking }: { tracking: OpenTracking }) {
  const { data, request, refresh } = useMail();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = tracking.state === "active" || tracking.state === "seen";
  const windowEnded = tracking.state === "expired";
  return (
    <details className="wm-tracking-details">
      <summary>
        <TrackingBadge tracking={tracking} />
        <span>tracking details</span>
      </summary>
      <p>
        {tracking.firstOpenedAt
          ? `first pixel request: ${mailDate(tracking.firstOpenedAt, "PPpp", data.mailbox.timezone)}.`
          : "no pixel request has been recorded."}{" "}
        Image proxies and scanners may trigger Seen, while blocked images may hide opens. One pixel
        covers the whole message; it does not identify a recipient.
      </p>
      {tracking.expiresAt && (
        <p>
          {tracking.state === "stopped"
            ? "tracking stopped. Original window ends"
            : windowEnded
              ? "tracking window ended"
              : "tracking expires"}{" "}
          {mailDate(tracking.expiresAt, "PP", data.mailbox.timezone)}.
        </p>
      )}
      {live && (
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await request(`tracking/${tracking.id}`, "DELETE");
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          stop tracking
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
