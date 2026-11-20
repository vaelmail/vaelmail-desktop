import { useSession } from "@/app/session";
import { Passkeys } from "./passkeys";
import { MailboxEncryption } from "./mailbox-encryption";
import { PanicLock, SecurityEvents } from "./security-events";
import { AppLink as NextLink } from "@/shell/app-link";
import Image from "@/ui/image";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { encryptionQueryKey } from "@/features/mail/composer-pgp";
import { encryptionStatus } from "@/lib/encryption/api";
import {
  ArrowRightIcon,
  DownloadSimpleIcon,
  ListChecksIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { VaelSelect } from "@/ui/select";
import { Button } from "@/ui/controls";
import { api, recovery } from "@/lib/mail/client";
import { useMail } from "@/features/mailbox/context";
import { useAccount, dateLabel, downloadText } from "./context";
import { saveOpenDrafts } from "@/lib/workspace-navigation";
import {
  AccountDialog,
  AccountSection,
  CopyButton,
  DialogActions,
  InlineError,
  SecretValue,
  VerificationFields,
} from "./ui";

type Credential = {
  id: string;
  login: string;
  label: string;
  scope: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at?: string | null;
};
type Setup = { grant: string; secret: string; qr: string };
type Rotation = { grant: string; accountKey: string };
type Flow =
  | "enable"
  | "disable"
  | "replace"
  | "rotate"
  | "credential"
  | "codes"
  | "issued"
  | "revoke"
  | "session";
const titles: Record<Flow, string> = {
  enable: "set up two-factor",
  disable: "disable two-factor?",
  replace: "replace recovery codes?",
  rotate: "rotate account number",
  credential: "connect a mail app",
  codes: "save your recovery codes",
  issued: "save your app credential",
  revoke: "revoke this credential?",
  session: "sign out this browser?",
};
export function ProductionSecurity() {
  const { account } = useAccount(),
    { refresh, data } = useMail();
  const encryption = useQuery({
    queryKey: encryptionQueryKey,
    queryFn: ({ signal }) => encryptionStatus(signal),
    retry: false,
  });
  const mailboxEncrypted = !!encryption.data && encryption.data.state !== "off";
  const [flow, setFlow] = useState<Flow | null>(null);
  const [number, setNumber] = useState(""),
    [factor, setFactor] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [setup, setSetup] = useState<Setup | null>(null),
    [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]),
    [saved, setSaved] = useState(false),
    [discard, setDiscard] = useState(false);
  const [rotation, setRotation] = useState<Rotation | null>(null),
    [proof, setProof] = useState("");
  const [label, setLabel] = useState(""),
    [scope, setScope] = useState("both");
  const [issued, setIssued] = useState<{
    login: string;
    secret: string;
  } | null>(null);
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]),
    [credentialsLoading, setCredentialsLoading] = useState(true),
    [credentialsError, setCredentialsError] = useState("");
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    void api<Credential[]>("/api/account/credentials", "GET", undefined, undefined, abort.signal)
      .then((values) => {
        if (!abort.signal.aborted) setCredentials(values);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setCredentialsError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setCredentialsLoading(false);
      });
    return () => {
      mounted.current = false;
      abort.abort();
    };
  }, []);
  async function load() {
    setCredentialsLoading(true);
    setCredentialsError("");
    try {
      const values = await api<Credential[]>("/api/account/credentials");
      if (mounted.current) setCredentials(values);
    } catch (e) {
      if (mounted.current) setCredentialsError((e as Error).message);
    } finally {
      if (mounted.current) setCredentialsLoading(false);
    }
  }
  function reset() {
    setFlow(null);
    setNumber("");
    setFactor("");
    setError("");
    setSetup(null);
    setCode("");
    setCodes([]);
    setRotation(null);
    setProof("");
    setSaved(false);
    setIssued(null);
    setTarget(null);
    setLabel("");
    setScope("both");
    setDiscard(false);
  }
  function open(next: Flow, value?: { id: string; label: string }) {
    reset();
    setFlow(next);
    setTarget(value ?? null);
  }
  function close() {
    if (inFlight.current) return;
    if (!saved && (flow === "codes" || flow === "issued" || !!rotation)) {
      setDiscard(true);
      return;
    }
    reset();
  }
  async function perform<T>(action: string, extra: object = {}): Promise<T> {
    return api<T>("/api/account", "POST", {
      action,
      accountKey: number,
      ...(factor ? { factor } : {}),
      ...extra,
    });
  }
  async function sync() {
    try {
      await refresh();
    } catch {
      if (mounted.current)
        setError(
          "change saved, but account status could not refresh. reload the page after saving any values shown here.",
        );
    }
  }
  async function run(work: () => Promise<void>, generatesSecret = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (mounted.current) {
        const uncertain =
          generatesSecret &&
          (!(e instanceof Error && "status" in e) ||
            Number((e as { status?: number }).status) >= 500);
        setError(
          uncertain
            ? "the response was interrupted. the change may have completed. refresh your account status before starting again. if new recovery codes were lost, replace them with fresh verification."
            : (e as Error).message || "could not complete this change. try again.",
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const needsVerification =
    flow === "disable" ||
    flow === "replace" ||
    flow === "credential" ||
    flow === "enable" ||
    flow === "rotate";
  return (
    <>
      <div className="da-security-summary">
        <ShieldCheckIcon size={22} aria-hidden />
        <div>
          <strong>
            {account.security.twoFactor
              ? "two-factor authentication is on"
              : "add a second layer of protection"}
          </strong>
          <p>
            {account.security.twoFactor
              ? "keep your account number and recovery codes somewhere safe."
              : "an authenticator app protects your account if someone learns your account number."}
          </p>
        </div>
        <span className={"da-status-pill" + (account.security.twoFactor ? " enabled" : "")}>
          {account.security.twoFactor ? "enabled" : "not enabled"}
        </span>
      </div>
      <NextLink className="da-task-row" href="/dashboard/checkup">
        <span className="da-task-icon">
          <ListChecksIcon size={20} aria-hidden />
        </span>
        <div>
          <h3>security checkup</h3>
          <p>review your sign-in factors, sessions and encryption in one list.</p>
        </div>
        <ArrowRightIcon size={18} aria-hidden />
      </NextLink>
      <AccountSection
        title="two-factor & recovery"
        id="setting-two-factor-authentication"
        description="use an authenticator app for a second step at sign-in."
      >
        <div className="da-setting-row">
          <div>
            <h3>authenticator app</h3>
            <p>
              {(account.security.totp ?? account.security.twoFactor)
                ? "your account requires a code when signing in."
                : "scan a QR code, verify your app and save your recovery codes."}
            </p>
          </div>
          <Button
            primary={!(account.security.totp ?? account.security.twoFactor)}
            onClick={() =>
              open((account.security.totp ?? account.security.twoFactor) ? "disable" : "enable")
            }
          >
            {(account.security.totp ?? account.security.twoFactor)
              ? "disable authenticator"
              : "set up authenticator"}
          </Button>
        </div>
        {account.security.twoFactor && (
          <div className="da-setting-row" id="setting-recovery-codes" tabIndex={-1}>
            <div>
              <h3>recovery codes</h3>
              <p>
                {account.security.recoveryCount} unused codes. each replaces one authenticator
                check; you still need your account number.
              </p>
            </div>
            <Button onClick={() => open("replace")}>replace codes</Button>
          </div>
        )}
      </AccountSection>
      <Passkeys />
      <MailboxEncryption />
      <AccountSection
        title="account number"
        id="setting-account-key"
        description="your saved number is the key to your account. vael cannot reveal or recover it."
      >
        <div className="da-setting-row">
          <div>
            <h3>replace your account number</h3>
            <p>
              rotation signs out every browser and revokes every mail app credential after you save
              and verify the replacement.
            </p>
            {account.security.keyChangedAt && (
              <p className="da-small">
                version {account.security.keyVersion} · changed{" "}
                {dateLabel(account.security.keyChangedAt)}
              </p>
            )}
          </div>
          <Button onClick={() => open("rotate")}>rotate number</Button>
        </div>
      </AccountSection>
      <AccountSection
        title="mail apps"
        id="setting-mail-apps"
        description="create a separate credential for each app. your account number is never a mail app password."
      >
        <div className="da-setting-row">
          <div>
            <h3>connect over IMAP or SMTP</h3>
            <p>free accounts can synchronize mail. sending requires plus.</p>
          </div>
          <Button onClick={() => open("credential")}>connect a mail app</Button>
        </div>
        {mailboxEncrypted && (
          <p className="da-small" role="note">
            your mailbox is encrypted. mail apps (IMAP) that sign in with an app password cannot
            read your encrypted mail.
          </p>
        )}
        {credentialsLoading && (
          <p className="da-muted" role="status">
            loading mail app credentials…
          </p>
        )}
        {credentialsError && (
          <>
            <InlineError message={credentialsError} />
            <Button onClick={() => void load()} disabled={credentialsLoading}>
              retry credentials
            </Button>
          </>
        )}
        {!credentialsLoading && !credentialsError && !credentials.some((c) => !c.revoked_at) && (
          <p className="da-empty-message">no mail apps connected yet.</p>
        )}
        {credentials
          .filter((c) => !c.revoked_at)
          .map((c) => (
            <div className="da-setting-row" key={c.id}>
              <div>
                <h3 data-sensitive>{c.label}</h3>
                <p>
                  {c.scope === "both" ? "imap & smtp" : c.scope} · created {dateLabel(c.created_at)}
                  {c.last_used_at ? " · last used " + dateLabel(c.last_used_at) : " · not used yet"}
                </p>
              </div>
              <Button onClick={() => open("revoke", { id: c.id, label: c.label })}>revoke</Button>
            </div>
          ))}
        <details className="da-connection-help">
          <summary>mail server settings</summary>
          <ConnectionDetails />
        </details>
      </AccountSection>
      <AccountSection title="browser sessions" description="browsers with access to your account.">
        {account.sessions.map((s) => (
          <div className="da-setting-row" key={s.id}>
            <div>
              <h3 data-sensitive>
                {s.name} {s.current && <span className="da-status-pill enabled">this browser</span>}
              </h3>
              <p>last active {dateLabel(s.lastActive)}</p>
            </div>
            {!s.current && (
              <Button onClick={() => open("session", { id: s.id, label: s.name })}>sign out</Button>
            )}
          </div>
        ))}
      </AccountSection>
      <SecurityEvents />
      <PanicLock />
      <InlineError message={!flow ? error : ""} />
      <AccountDialog
        open={!!flow}
        onClose={close}
        title={discard ? "close without saving?" : flow ? titles[flow] : "security"}
      >
        {discard ? (
          <div className="wm-form">
            <p>
              these values are shown only once. closing this dialog discards your copy.{" "}
              {flow === "codes"
                ? "you can replace recovery codes again with fresh verification."
                : rotation
                  ? "your current account number will keep working unless rotation was confirmed."
                  : "you can revoke this credential and create another."}
            </p>
            <DialogActions>
              <Button onClick={() => setDiscard(false)}>keep saving</Button>
              <Button danger onClick={reset}>
                discard & close
              </Button>
            </DialogActions>
          </div>
        ) : (
          <form
            className="wm-form da-security-form"
            onSubmit={(e) => {
              e.preventDefault();
              e.currentTarget
                .querySelector<HTMLButtonElement>(
                  ".da-dialog-actions button.primary, .da-dialog-actions button.danger",
                )
                ?.click();
            }}
          >
            {flow === "enable" && (
              <>
                <div className="da-step-label">
                  {setup ? "step 2 of 3" : "step 1 of 3"}
                  <span>{setup ? "connect your authenticator" : "verify your account"}</span>
                </div>
                {!setup && (
                  <p>
                    you&#39;ll need an authenticator app. after verifying your code, save the
                    recovery codes so you can sign in if you lose access to the app.
                  </p>
                )}
                {setup && (
                  <>
                    <div className="da-qr-panel">
                      <Image
                        unoptimized
                        src={setup.qr}
                        alt="authenticator setup QR code"
                        width={200}
                        height={200}
                      />
                    </div>
                    <details className="da-manual-setup">
                      <summary>can&#39;t scan? enter a setup key</summary>
                      <SecretValue label="setup key" value={setup.secret} />
                    </details>
                    <label>
                      six-digit code
                      <input
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  </>
                )}
              </>
            )}
            {flow === "disable" && (
              <p>
                your authenticator will stop working. if passkeys remain enabled, they and your
                recovery codes will continue working. otherwise, two-factor authentication and
                recovery codes will be disabled.
              </p>
            )}
            {flow === "replace" && (
              <p>
                all current recovery codes will stop working, including any saved copies. your
                authenticator stays enabled. save the new set when it appears.
              </p>
            )}
            {flow === "rotate" && !rotation && (
              <p>
                save and verify the replacement before confirming. confirming signs out every
                browser and revokes every app credential.
              </p>
            )}
            {flow === "rotate" && rotation && (
              <>
                <div className="da-step-label">
                  step 2 of 2<span>save and verify the replacement</span>
                </div>
                <p>
                  your current number keeps working until you confirm. vael cannot recover the
                  replacement.
                </p>
                <SecretValue label="new account number" value={rotation.accountKey} />
                <Button
                  onClick={() => downloadText("vael-account-number.txt", rotation.accountKey)}
                >
                  <DownloadSimpleIcon size={16} aria-hidden />
                  download number
                </Button>
                <label className="da-checkbox">
                  <input
                    type="checkbox"
                    checked={saved}
                    disabled={busy}
                    onChange={(e) => setSaved(e.target.checked)}
                  />
                  i saved the new number
                </label>
                <label>
                  re-enter the replacement
                  <input
                    name="newNumber"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={16}
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {!!account.security.passkeyCount && (
                  <Button onClick={() => setFactor(factor === "@passkey" ? "" : "@passkey")}>
                    {factor === "@passkey" ? "use a code" : "verify with a passkey"}
                  </Button>
                )}
                {account.security.twoFactor && factor !== "@passkey" && (
                  <label>
                    fresh authenticator or unused recovery code
                    <input
                      aria-label="rotation verification code"
                      name="factor"
                      autoComplete="one-time-code"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={80}
                      value={factor}
                      onChange={(e) => setFactor(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                )}
              </>
            )}
            {flow === "credential" && (
              <>
                <p>
                  give this connection a name you&#39;ll recognize. its password will be shown once.
                </p>
                <label>
                  credential label
                  <input
                    name="label"
                    maxLength={80}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    disabled={busy}
                    placeholder="e.g. thunderbird"
                  />
                </label>
                <label>
                  protocol
                  <VaelSelect
                    aria-label="protocol"
                    value={scope}
                    disabled={busy}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    <option value="both">imap & smtp</option>
                    <option value="imap">imap only</option>
                    <option value="smtp">smtp only</option>
                  </VaelSelect>
                </label>
              </>
            )}
            {needsVerification &&
              !rotation &&
              !(flow === "enable" && setup && !account.security.twoFactor) && (
                <VerificationFields
                  number={number}
                  factor={factor}
                  onNumber={setNumber}
                  onFactor={setFactor}
                  twoFactor={account.security.twoFactor}
                  busy={busy}
                />
              )}
            {flow === "codes" && (
              <>
                <div className="da-step-label">
                  recovery codes<span>shown once</span>
                </div>
                <p>
                  each code can be used once in place of your authenticator. keep your account
                  number too: these codes cannot replace it.
                </p>
                <ul className="da-recovery-codes">
                  {codes.map((c) => (
                    <li key={c}>
                      <code translate="no">{c}</code>
                    </li>
                  ))}
                </ul>
                <div className="da-inline-actions">
                  <Button onClick={() => downloadText("vael-recovery-codes.txt", codes.join("\n"))}>
                    <DownloadSimpleIcon size={16} aria-hidden />
                    download codes
                  </Button>
                  <CopyButton value={codes.join("\n")} label="copy codes" />
                </div>
                <label className="da-checkbox">
                  <input
                    type="checkbox"
                    checked={saved}
                    onChange={(e) => setSaved(e.target.checked)}
                  />
                  i saved my recovery codes
                </label>
              </>
            )}
            {flow === "issued" && issued && (
              <>
                <p>
                  use this login as your app&#39;s username and this password for the selected
                  protocols. keep both somewhere safe.
                </p>
                <SecretValue label="login" value={issued.login} />
                <SecretValue label="password" value={issued.secret} />
                <ConnectionDetails />
                <Button
                  onClick={() =>
                    downloadText(
                      "vael-app-credential.txt",
                      "login: " + issued.login + "\npassword: " + issued.secret,
                    )
                  }
                >
                  <DownloadSimpleIcon size={16} aria-hidden />
                  download credential
                </Button>
                <label className="da-checkbox">
                  <input
                    type="checkbox"
                    checked={saved}
                    onChange={(e) => setSaved(e.target.checked)}
                  />
                  i saved this credential
                </label>
              </>
            )}
            {flow === "revoke" && (
              <p>
                &quot;{target?.label}&quot; will lose access to your mailbox. configure a new
                credential in that app if you want to reconnect it.
              </p>
            )}
            {flow === "session" && (
              <p>&quot;{target?.label}&quot; will be signed out. this browser keeps its access.</p>
            )}
            <InlineError message={error} />
            <DialogActions>
              <Button disabled={busy} onClick={close}>
                {flow === "codes" || flow === "issued" ? "close" : "cancel"}
              </Button>
              {flow === "enable" && (
                <Button
                  primary
                  busy={busy}
                  disabled={
                    setup
                      ? !/^[0-9]{6}$/.test(code) || (account.security.twoFactor && !factor)
                      : !/^[0-9]{16}$/.test(number)
                  }
                  onClick={() =>
                    void run(async () => {
                      if (!setup) {
                        const result = await perform<Setup>("totp-begin");
                        if (mounted.current) {
                          setSetup(result);
                          if (factor !== "@passkey") setFactor("");
                        }
                      } else {
                        const result = await perform<{ codes: string[] }>("totp-commit", {
                          grant: setup.grant,
                          code,
                        });
                        if (mounted.current) {
                          setCodes(result.codes);
                          setSetup(null);
                          setNumber("");
                          setCode("");
                          setFlow(result.codes.length ? "codes" : null);
                          setSaved(false);
                        }
                        await sync();
                      }
                    }, true)
                  }
                >
                  {setup ? "verify & enable" : "continue to setup"}
                </Button>
              )}
              {(flow === "disable" || flow === "replace") && (
                <Button
                  danger={flow === "disable"}
                  primary={flow === "replace"}
                  busy={busy}
                  disabled={!/^[0-9]{16}$/.test(number) || !factor}
                  onClick={() =>
                    void run(async () => {
                      if (flow === "disable") {
                        await perform("totp-disable");
                        if (mounted.current) reset();
                      } else {
                        const result = await perform<{ codes: string[] }>("recovery-codes");
                        if (mounted.current) {
                          setCodes(result.codes);
                          setNumber("");
                          setFactor("");
                          setFlow("codes");
                          setSaved(false);
                        }
                      }
                      await sync();
                    }, flow === "replace")
                  }
                >
                  {flow === "disable" ? "disable two-factor" : "replace codes"}
                </Button>
              )}
              {flow === "rotate" && (
                <Button
                  primary={!rotation}
                  danger={!!rotation}
                  busy={busy}
                  disabled={
                    rotation
                      ? !saved ||
                        proof !== rotation.accountKey ||
                        (account.security.twoFactor && !factor)
                      : !/^[0-9]{16}$/.test(number) || (account.security.twoFactor && !factor)
                  }
                  onClick={() =>
                    void run(async () => {
                      if (!rotation) {
                        const result = await perform<Rotation>("rotation-begin");
                        if (mounted.current) {
                          setRotation(result);
                          setFactor("");
                        }
                      } else {
                        await saveOpenDrafts();
                        await perform("rotation-commit", {
                          grant: rotation.grant,
                          newNumber: proof,
                          saved: true,
                        });
                        await recovery.drafts
                          .where("mailboxId")
                          .equals(data.mailbox.id)
                          .delete()
                          .catch(() => {});
                        void useSession.getState().signOut();
                      }
                    }, true)
                  }
                >
                  {rotation ? "confirm rotation & sign out" : "create replacement"}
                </Button>
              )}
              {flow === "credential" && (
                <Button
                  primary
                  busy={busy}
                  disabled={
                    !label.trim() ||
                    !/^[0-9]{16}$/.test(number) ||
                    (account.security.twoFactor && !factor)
                  }
                  onClick={() =>
                    void run(async () => {
                      const result = await perform<{
                        login: string;
                        secret: string;
                      }>("app-credential", { label: label.trim(), scope });
                      if (mounted.current) {
                        setIssued(result);
                        setNumber("");
                        setFactor("");
                        setFlow("issued");
                        setSaved(false);
                      }
                      await load();
                    }, true)
                  }
                >
                  create credential
                </Button>
              )}
              {(flow === "codes" || flow === "issued") && (
                <Button primary disabled={!saved} onClick={reset}>
                  done
                </Button>
              )}
              {(flow === "revoke" || flow === "session") && (
                <Button
                  danger
                  busy={busy}
                  onClick={() =>
                    void run(async () => {
                      if (
                        flow === "session" &&
                        account.sessions.some(
                          (session) => session.id === target!.id && session.current,
                        )
                      )
                        await saveOpenDrafts();
                      await api(
                        "/api/account/" +
                          (flow === "revoke" ? "credentials/" : "sessions/") +
                          target!.id,
                        "DELETE",
                      );
                      if (mounted.current) reset();
                      await (flow === "revoke" ? load() : sync());
                    })
                  }
                >
                  {flow === "revoke" ? "revoke credential" : "sign out browser"}
                </Button>
              )}
            </DialogActions>
          </form>
        )}
      </AccountDialog>
    </>
  );
}
function ConnectionDetails() {
  return (
    <dl className="da-connection-details">
      <div>
        <dt>server</dt>
        <dd>mail.vael.email</dd>
      </div>
      <div>
        <dt>IMAP</dt>
        <dd>993 · TLS</dd>
      </div>
      <div>
        <dt>SMTP</dt>
        <dd>587 · STARTTLS</dd>
      </div>
      <div>
        <dt>SMTP alternative</dt>
        <dd>465 · TLS</dd>
      </div>
    </dl>
  );
}
