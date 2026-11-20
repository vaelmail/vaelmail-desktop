import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/mail/client";
import { useMail } from "@/features/mailbox/context";
import { bridge } from "@/lib/bridge";
import { Button } from "@/ui/controls";
import { useAccount, dateLabel } from "./context";
import {
  AccountSection,
  AccountDialog,
  VerificationFields,
  DialogActions,
  InlineError,
} from "./ui";

type Key = { id: string; label: string; created_at: string };

export function Passkeys() {
  const { account } = useAccount();
  const { refresh } = useMail();
  const [keys, setKeys] = useState<Key[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Key | null>(null);
  const [number, setNumber] = useState("");
  const [factor, setFactor] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const flight = useRef(false);

  useEffect(() => {
    const abort = new AbortController();
    api<Key[]>("/api/account/passkeys", "GET", undefined, undefined, abort.signal)
      .then((values) => {
        if (abort.signal.aborted) return;
        setKeys(values);
        setLoaded(true);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError("could not load passkeys. reload before making changes.");
      });
    return () => abort.abort();
  }, []);

  const close = () => {
    if (flight.current) return;
    setTarget(null);
    setNumber("");
    setFactor("");
    setAcknowledged(false);
    setError("");
  };

  const remove = async () => {
    if (flight.current || !target) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/account", "POST", {
        action: "passkey-remove",
        accountKey: number,
        ...(factor ? { factor } : {}),
        id: target.id,
      });
      setKeys(await api<Key[]>("/api/account/passkeys"));
      await refresh();
      setTarget(null);
      setNumber("");
      setFactor("");
      setAcknowledged(false);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status < 500) setFactor("");
      setError(
        failure instanceof Error
          ? failure.message
          : "could not change passkeys. refresh account status before retrying.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  const lastFactor = keys.length === 1 && !account.security.totp;

  return (
    <>
      <AccountSection
        title="passkeys"
        description="a second factor with your device or security key. your account number is still required."
      >
        <div className="da-setting-row">
          <div>
            <h3>manage on vaelmail.com</h3>
            <p>
              passkeys are tied to the vaelmail.com website, so new passkeys are added there. you
              can review and remove them here.
            </p>
          </div>
          <Button
            onClick={() =>
              void bridge.files.openExternal("https://vaelmail.com/dashboard/security")
            }
          >
            open vaelmail.com
          </Button>
        </div>
        {keys.map((key) => (
          <div className="da-setting-row" key={key.id}>
            <div>
              <h3>{key.label}</h3>
              <p>created {dateLabel(key.created_at)}</p>
            </div>
            <Button
              onClick={() => {
                setTarget(key);
                setError("");
              }}
            >
              remove
            </Button>
          </div>
        ))}
        {loaded && keys.length === 0 && (
          <p className="da-empty-message" role="status">
            no passkeys registered yet.
          </p>
        )}
        {!loaded && (
          <p role="status" className="da-muted">
            loading passkeys…
          </p>
        )}
        <InlineError message={!target ? error : ""} />
      </AccountSection>
      <AccountDialog open={!!target} onClose={close} title="remove passkey?">
        <form
          className="wm-form"
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <p>
            {lastFactor
              ? "this is your final second factor. removing it disables two-factor authentication and deletes your recovery codes. sign-in will require only your account number."
              : "this passkey will stop working. your other enabled factors remain available."}
          </p>
          <label className="da-checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              disabled={busy}
            />
            i understand the effect of removing this passkey
          </label>
          <VerificationFields
            number={number}
            factor={factor}
            onNumber={setNumber}
            onFactor={setFactor}
            twoFactor={account.security.twoFactor}
            busy={busy}
          />
          <InlineError message={error} />
          <DialogActions>
            <Button disabled={busy} onClick={close}>
              cancel
            </Button>
            <Button
              danger
              busy={busy}
              disabled={
                !acknowledged || !/^\d{16}$/.test(number) || (account.security.twoFactor && !factor)
              }
              onClick={() => void remove()}
            >
              remove passkey
            </Button>
          </DialogActions>
        </form>
      </AccountDialog>
    </>
  );
}
