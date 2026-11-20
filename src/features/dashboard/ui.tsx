import { useContext, useId, type ReactNode } from "react";
import { toast } from "sonner";
import { CopyIcon } from "@phosphor-icons/react";
import { passkeyFactor } from "@/lib/bridge";
import { Button, Modal } from "@/ui/controls";
import { AccountContext } from "./context";

export function AccountDialog(props: Parameters<typeof Modal>[0]) {
  return <Modal {...props} className="da-overlay" />;
}
export function AccountSection({
  title,
  description,
  children,
  id,
  danger = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
  danger?: boolean;
}) {
  return (
    <section
      className={"da-section da-panel" + (danger ? " da-danger-section" : "")}
      id={id}
      tabIndex={id ? -1 : undefined}
    >
      <div className="da-panel-heading">
        <h2>{title}</h2>
        {description && <p className="da-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
export function VerificationFields({
  number,
  factor,
  onNumber,
  onFactor,
  twoFactor,
  busy,
}: {
  number: string;
  factor: string;
  onNumber: (value: string) => void;
  onFactor: (value: string) => void;
  twoFactor: boolean;
  busy: boolean;
}) {
  const id = useId();
  const hasPasskeys = !!useContext(AccountContext)?.account.security.passkeyCount;
  const usingPasskey = factor === passkeyFactor;
  return (
    <fieldset className="da-verification" disabled={busy}>
      <legend>confirm it&#39;s you</legend>
      <label htmlFor={id + "-number"}>account number</label>
      <input
        id={id + "-number"}
        name="accountKey"
        required
        pattern="[0-9]{16}"
        aria-label="account number for security"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={16}
        value={number}
        onChange={(e) => onNumber(e.target.value)}
        spellCheck={false}
      />
      <p className="da-field-help">your saved 16-digit number. vael cannot recover it.</p>
      {twoFactor && hasPasskeys && (
        <div className="da-inline-actions">
          <Button onClick={() => onFactor(usingPasskey ? "" : passkeyFactor)}>
            {usingPasskey ? "use an authenticator or recovery code" : "verify with a passkey"}
          </Button>
          {usingPasskey && (
            <p className="da-field-help">
              your browser opens to check the passkey when you continue.
            </p>
          )}
        </div>
      )}
      {twoFactor && !usingPasskey && (
        <>
          <label htmlFor={id + "-factor"}>authenticator or recovery code</label>
          <input
            id={id + "-factor"}
            name="factor"
            required
            aria-label="security verification code"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={80}
            value={factor}
            onChange={(e) => onFactor(e.target.value)}
          />
        </>
      )}
    </fieldset>
  );
}
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="da-dialog-actions">{children}</div>;
}
export function SecretValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="da-secret-value">
      <span>{label}</span>
      <div>
        <code translate="no">{value}</code>
        <CopyButton value={value} label={"copy " + label} />
      </div>
    </div>
  );
}
export function CopyButton({ value, label = "copy" }: { value: string; label?: string }) {
  return (
    <Button
      aria-label={label}
      onClick={() =>
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success("copied"))
          .catch(() => toast.error("clipboard unavailable; select and copy the text"))
      }
    >
      <CopyIcon size={16} aria-hidden />
      {label}
    </Button>
  );
}
export function InlineError({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="da-error">
      {message}
    </p>
  ) : null;
}
