import { useSession } from "@/app/session";
import { useEffect, useRef, useState } from "react";
import { DownloadSimpleIcon, FileTextIcon, EnvelopeIcon } from "@phosphor-icons/react";
import { VaelSelect } from "@/ui/select";
import { Button } from "@/ui/controls";
import { api, recovery } from "@/lib/mail/client";
import { useMail } from "@/features/mailbox/context";
import { useAccount } from "./context";
import { useWindowCloseGuard } from "@/shell/close-guard";
import {
  AccountDialog,
  AccountSection,
  DialogActions,
  InlineError,
  VerificationFields,
} from "./ui";
export function ProductionData() {
  const { account } = useAccount(),
    { data } = useMail();
  const [flow, setFlow] = useState<"inactivity" | "delete" | null>(null);
  const [number, setNumber] = useState(""),
    [factor, setFactor] = useState("");
  const [confirmation, setConfirmation] = useState(""),
    [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false);
  const [policyLoading, setPolicyLoading] = useState(true),
    [policyError, setPolicyError] = useState("");
  const [policySaved, setPolicySaved] = useState(false),
    [months, setMonths] = useState("disabled"),
    [storedMonths, setStoredMonths] = useState("disabled");
  useWindowCloseGuard(() => {
    if (busy || inFlight.current)
      throw new Error("Wait for the current account request to finish.");
    if (months !== storedMonths)
      throw new Error("Save or reset your inactivity preference before leaving Your Data.");
  });
  useEffect(() => {
    const abort = new AbortController();
    void api<{ months: number | null }>(
      "/api/account/inactivity",
      "GET",
      undefined,
      undefined,
      abort.signal,
    )
      .then((v) => {
        if (!abort.signal.aborted) {
          const value = v.months === null ? "disabled" : String(v.months);
          setMonths(value);
          setStoredMonths(value);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setPolicyError("could not load your inactivity policy.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setPolicyLoading(false);
      });
    return () => abort.abort();
  }, []);
  async function reloadPolicy() {
    setPolicyLoading(true);
    setPolicyError("");
    try {
      const policy = await api<{ months: number | null }>("/api/account/inactivity");
      const value = policy.months === null ? "disabled" : String(policy.months);
      setMonths(value);
      setStoredMonths(value);
    } catch {
      setPolicyError("could not load your inactivity policy.");
    } finally {
      setPolicyLoading(false);
    }
  }
  function close() {
    if (inFlight.current) return;
    setFlow(null);
    setNumber("");
    setFactor("");
    setConfirmation("");
    setAck(false);
    setError("");
  }
  function open(next: typeof flow) {
    close();
    setFlow(next);
  }
  async function submit() {
    if (
      inFlight.current ||
      !/^[0-9]{16}$/.test(number) ||
      (account.security.twoFactor && !factor) ||
      (flow === "delete" && (!ack || confirmation !== account.address))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/account", "POST", {
        action: flow,
        accountKey: number,
        ...(factor ? { factor } : {}),
        ...(flow === "delete"
          ? { confirmation }
          : { months: months === "disabled" ? null : Number(months) }),
      });
      if (flow === "delete") {
        await recovery.drafts
          .where("mailboxId")
          .equals(data.mailbox.id)
          .delete()
          .catch(() => {});
        void useSession.getState().signOut();
      } else {
        setStoredMonths(months);
        setPolicySaved(true);
        setFlow(null);
        setNumber("");
        setFactor("");
      }
    } catch (e) {
      setError((e as Error).message || "could not save this change. try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <AccountSection
        title="export your data"
        description="download a copy of your account or take your mailbox to another mail app."
      >
        <div className="da-export-row">
          <FileTextIcon size={22} aria-hidden />
          <div>
            <h3>account data</h3>
            <p>
              account settings, addresses and account metadata as JSON. login credentials are
              excluded.
            </p>
          </div>
          <a className="wm-button" href="/api/account/export" download>
            <DownloadSimpleIcon size={16} aria-hidden />
            export JSON
          </a>
        </div>
        <div className="da-export-row">
          <EnvelopeIcon size={22} aria-hidden />
          <div>
            <h3>mailbox content</h3>
            <p>
              original email, attachments, saved drafts and pending outgoing copies as mbox. folders
              are exported sequentially; changes during export may affect the result.
            </p>
          </div>
          <a className="wm-button" href="/api/account/mail-export" download>
            <DownloadSimpleIcon size={16} aria-hidden />
            export mbox
          </a>
        </div>
      </AccountSection>
      <AccountSection
        title="inactivity deletion"
        description="choose whether to delete your account after a period without activity."
      >
        {policyLoading && (
          <p role="status" className="da-muted">
            loading inactivity policy…
          </p>
        )}
        {policyError && (
          <>
            <InlineError message={policyError} />
            <Button disabled={policyLoading} onClick={() => void reloadPolicy()}>
              retry inactivity policy
            </Button>
          </>
        )}
        <div className="da-setting-row">
          <div>
            <h3>delete after</h3>
            <p>
              receiving mail and background polling don&#39;t count. using vael or signing in
              through a mail app counts. deletion waits until paid access and grace have ended.
            </p>
          </div>
          <VaelSelect
            aria-label="delete after"
            disabled={policyLoading || !!policyError || busy}
            value={months}
            onChange={(e) => {
              setMonths(e.target.value);
              setPolicySaved(false);
            }}
          >
            <option value="disabled">disabled</option>
            {[3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m} calendar months
              </option>
            ))}
          </VaelSelect>
        </div>
        <div className="da-inline-actions">
          <Button
            disabled={policyLoading || !!policyError || busy || months === storedMonths}
            onClick={() => open("inactivity")}
          >
            save inactivity policy
          </Button>
          {months !== storedMonths && (
            <Button
              disabled={busy}
              onClick={() => {
                setMonths(storedMonths);
                setPolicySaved(false);
              }}
            >
              reset change
            </Button>
          )}
          {policySaved && (
            <span role="status" className="da-muted">
              inactivity policy saved.
            </span>
          )}
          {months !== storedMonths && <span className="da-muted">unsaved change</span>}
        </div>
      </AccountSection>
      <AccountSection
        danger
        title="delete your account"
        description="permanently end access and remove your mailbox. export anything you want to keep first."
      >
        <div className="da-setting-row">
          <div>
            <h3>permanent deletion</h3>
            <p>sign-in, mail app access and receiving stop immediately. this cannot be undone.</p>
          </div>
          <Button danger onClick={() => open("delete")}>
            delete account
          </Button>
        </div>
      </AccountSection>
      <AccountDialog
        open={!!flow}
        onClose={close}
        title={flow === "delete" ? "permanently delete your account?" : "save inactivity policy"}
      >
        <form
          className="wm-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {flow === "delete" ? (
            <>
              <p>
                access, app credentials and receiving stop immediately. live data is purged within
                24 hours; encrypted backups expire within seven days.
              </p>
              <p>
                primary and random addresses are permanently retired. custom aliases become
                available to others after their 24-hour reservation and may receive correspondence
                intended for you.
              </p>
              <label>
                type {account.address}
                <input
                  name="confirmation"
                  value={confirmation}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <label className="da-checkbox">
                <input
                  type="checkbox"
                  checked={ack}
                  disabled={busy}
                  onChange={(e) => setAck(e.target.checked)}
                />
                i understand that deletion is permanent.
              </label>
            </>
          ) : (
            <p>
              {months === "disabled"
                ? "automatic deletion for inactivity will be disabled."
                : `your account will be deleted after ${months} calendar months without activity, once paid access and grace have ended.`}
            </p>
          )}
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
              type="submit"
              danger={flow === "delete"}
              primary={flow !== "delete"}
              busy={busy}
              disabled={
                !/^[0-9]{16}$/.test(number) ||
                (account.security.twoFactor && !factor) ||
                (flow === "delete" && (!ack || confirmation !== account.address))
              }
            >
              {flow === "delete" ? "permanently delete account" : "save policy"}
            </Button>
          </DialogActions>
        </form>
      </AccountDialog>
    </>
  );
}
