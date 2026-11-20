import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DownloadSimpleIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { ApiError } from "@/lib/mail/client";
import { Button, Confirm } from "@/ui/controls";
import { useMail } from "@/features/mailbox/context";
import { encryptionQueryKey } from "@/features/mail/composer-pgp";
import {
  addContactKey,
  backupRetention,
  beginChangeKey,
  beginEncryption,
  commitChangeKey,
  deleteContactKey,
  DISABLE_PHRASE,
  disableEncryption,
  disablePhraseMatches,
  enableEncryption,
  encryptionStatus,
  exportPrivateKey,
  publicKeyArmor,
  listContactKeys,
  lockMailbox,
  pgpSecret,
  type BeginResult,
  type ChangeKeyBegin,
  type ContactKey,
  type EncryptionStatus,
} from "@/lib/encryption/api";
import { openUnlockPrompt, reportMailboxLocked } from "@/lib/encryption/lock-state";
import {
  CONFIRM_GROUPS,
  confirmGroupsMatch,
  confirmValue,
  mailboxKeyFile,
  mailboxKeyGroups,
  normalizeMailboxKey,
} from "@/lib/encryption/mailbox-key";
import { useAccount, dateLabel, downloadText } from "./context";
import {
  AccountDialog,
  AccountSection,
  CopyButton,
  DialogActions,
  InlineError,
  VerificationFields,
} from "./ui";

type Issued = BeginResult | ChangeKeyBegin;
type Flow = "enable" | "change" | "contact" | "export" | "disable";
type Step = "explain" | "verify" | "save" | "confirm" | "working" | "done";

const OFFLINE_TOOL_SHA256 =
  (typeof process !== "undefined" && process.env.VAEL_DECRYPT_SHA256) || "";

function oldKeyCopy(days: number) {
  return `the new key protects your mailbox from now on. someone who already had both your old key and a copy of our backups from before the change could still read that mail until those backups expire, within ${days} days.`;
}

function imapClientsWarning(count: number) {
  return count === 1
    ? "1 mail app (IMAP) uses an app password; it won't be able to read your mail once it's encrypted."
    : `${count} mail apps (IMAP) use app passwords; they won't be able to read your mail once it's encrypted.`;
}
const titles: Record<Flow, string> = {
  enable: "turn on the encrypted mailbox",
  change: "change your mailbox key",
  contact: "add a contact's public key",
  export: "export your OpenPGP private key",
  disable: "turn off the encrypted mailbox",
};

const stateLabels: Record<EncryptionStatus["state"], string> = {
  off: "off",
  enabled: "on",
  migrating: "turning on…",
  disabling: "turning off…",
};

function migrateErrorCopy(error: string, direction: "encrypt" | "decrypt") {
  if (error === "locked")
    return direction === "encrypt"
      ? "paused: unlock to continue encrypting your existing mail."
      : "paused: unlock to continue storing your mail readable again.";
  if (error === "quota_full")
    return "stopped: your mailbox is too full. while each message is saved again it briefly needs room twice; free some space, then unlock again to continue. your original messages are kept unchanged.";
  return (
    "stopped: " +
    error.replace(/_/g, " ") +
    ". your original messages are kept unchanged. unlock again to retry, or contact support."
  );
}

function safeFileName(name: string | undefined, fallback: string) {
  const clean = (name || "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return clean && !clean.startsWith(".") ? clean : fallback;
}

function formatFingerprint(value: string) {
  return (
    value
      .replace(/\s+/g, "")
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(" ") ?? value
  );
}

export function MailboxEncryption() {
  const { account } = useAccount(),
    { data } = useMail();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: encryptionQueryKey,
    queryFn: ({ signal }) => encryptionStatus(signal),
    refetchInterval: (q) =>
      q.state.data?.state === "migrating" || q.state.data?.state === "disabling" ? 3000 : false,
    retry: false,
  });
  const [flow, setFlow] = useState<Flow | null>(null),
    [step, setStep] = useState<Step>("verify");
  const [number, setNumber] = useState(""),
    [factor, setFactor] = useState("");
  const [currentKey, setCurrentKey] = useState(""),
    [phrase, setPhrase] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [typed, setTyped] = useState<[string, string]>(["", ""]),
    [saved, setSaved] = useState(false),
    [discard, setDiscard] = useState(false);
  const [armor, setArmor] = useState("");
  const [imapAck, setImapAck] = useState(false),
    [doneNote, setDoneNote] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = () => client.invalidateQueries({ queryKey: encryptionQueryKey });
  const lockedHere = !!status.data && status.data.state !== "off" && !status.data.unlocked;
  useEffect(() => {
    if (lockedHere) reportMailboxLocked(false);
  }, [lockedHere]);
  function reset() {
    setFlow(null);
    setStep("verify");
    setNumber("");
    setFactor("");
    setCurrentKey("");
    setPhrase("");
    setIssued(null);
    setTyped(["", ""]);
    setSaved(false);
    setDiscard(false);
    setArmor("");
    setImapAck(false);
    setDoneNote("");
    setError("");
  }
  function open(next: Flow) {
    reset();
    setFlow(next);
    if (next === "disable") setStep("explain");
  }
  function close() {
    if (inFlight.current) return;
    if (issued && (step === "save" || step === "confirm")) {
      setDiscard(true);
      return;
    }
    reset();
  }
  async function run(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof ApiError && e.detail.code === "mailbox_key_invalid"
            ? "that mailbox key was not accepted. check it and try again."
            : e instanceof ApiError && e.status === 429
              ? "too many attempts. wait a little before trying again."
              : e instanceof ApiError && e.detail.code === "disable_confirmation_mismatch"
                ? `type "${DISABLE_PHRASE}" exactly to confirm.`
                : e instanceof ApiError && e.detail.code === "mailbox_encryption_migrating"
                  ? "your mail is still being encrypted. start again to cancel encryption instead."
                  : (e as Error).message || "could not complete this change. try again.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (status.isPending) return null;
  if (status.error)
    return (
      <AccountSection title="encrypted mailbox" id="setting-mailbox-encryption">
        <InlineError message="the encrypted mailbox status could not be loaded." />
        <Button onClick={() => void status.refetch()}>retry</Button>
      </AccountSection>
    );
  const s = status.data;
  if (!s) return null;
  const reauthReady = /^[0-9]{16}$/.test(number) && (!account.security.twoFactor || !!factor);
  const groups = issued ? mailboxKeyGroups(issued.key) : [];
  const days = backupRetention(s);
  const imapClients =
    Number.isInteger(s.imapClients) && (s.imapClients as number) > 0
      ? (s.imapClients as number)
      : 0;
  const cancelling = s.state === "migrating";
  const commitDisable = () =>
    run(async () => {
      const normalized = normalizeMailboxKey(currentKey);
      if (!normalized)
        throw new Error("that is not a mailbox key. it has 32 letters and digits in 8 groups.");
      setCurrentKey("");
      await disableEncryption({ accountKey: number, factor }, normalized, phrase, {
        cancel: cancelling,
      });
      if (mounted.current) reset();
      await Promise.all([
        refresh(),
        client.invalidateQueries({ queryKey: ["security-events"] }),
        client.invalidateQueries({ queryKey: ["security-checkup"] }),
      ]);
    });
  const commitEnable = () =>
    run(async () => {
      if (!issued?.grant) return;
      setStep("working");
      try {
        let pgp;
        if (issued.pgpPassphrase) {
          const { generateAccountKey } = await import("@/lib/encryption/pgp");
          pgp = await generateAccountKey(data.mailbox.address, issued.pgpPassphrase);
        }
        await enableEncryption({
          grant: issued.grant,
          confirm: confirmValue(typed),
          pgp,
        });
      } catch (e) {
        if (mounted.current) setStep("confirm");
        throw e;
      }
      if (mounted.current) reset();
      await refresh();
    });
  const commitChange = () =>
    run(async () => {
      if (!issued?.grant) return;
      setStep("working");
      let result;
      try {
        let privateKey: string | undefined;
        if (issued.pgpPassphrase && s.pgp) {
          const [{ relockPrivateKey }, secret] = await Promise.all([
            import("@/lib/encryption/pgp"),
            pgpSecret(),
          ]);
          if (secret.privateKey)
            privateKey = await relockPrivateKey(
              secret.privateKey,
              secret.passphrase,
              issued.pgpPassphrase,
            );
        }
        result = await commitChangeKey({
          grant: issued.grant,
          confirm: confirmValue(typed),
          privateKey,
        });
      } catch (e) {
        if (mounted.current) setStep("confirm");
        throw e;
      }
      if (mounted.current) {
        setIssued(null);
        setTyped(["", ""]);
        setSaved(false);
        setDoneNote(result.oldKeyNote?.trim() || oldKeyCopy(days));
        setStep("done");
      }
      await refresh();
    });
  return (
    <>
      <AccountSection
        title="encrypted mailbox"
        id="setting-mailbox-encryption"
        description="optional. when it is on, your stored mail is encrypted with a key only you hold."
      >
        <EncryptionSwitch
          status={s}
          onTurnOn={() => open("enable")}
          onTurnOff={() => open("disable")}
        />
        {s.state === "off" ? (
          <EncryptionExplainer retentionDays={s.backupRetentionDays} />
        ) : s.state === "disabling" ? (
          <EncryptionDisabling status={s} onAddContact={() => open("contact")} />
        ) : (
          <EncryptionOn
            status={s}
            onChangeKey={() => open("change")}
            onAddContact={() => open("contact")}
            onExport={() => open("export")}
            refresh={refresh}
          />
        )}
      </AccountSection>
      <AccountDialog
        open={!!flow}
        onClose={close}
        title={
          discard
            ? "close without saving?"
            : flow === "disable" && cancelling
              ? "cancel the encrypted mailbox"
              : flow
                ? titles[flow]
                : "encrypted mailbox"
        }
      >
        {discard ? (
          <div className="wm-form">
            <p>
              {flow === "change"
                ? "nothing has changed yet. your current mailbox key keeps working; the new key shown here will not be used. you can start again for a new one."
                : "nothing has changed yet. the key shown here will not be used; you can start again for a new one."}
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
                .querySelector<HTMLButtonElement>(".da-dialog-actions button.primary")
                ?.click();
            }}
          >
            {flow === "export" && (
              <>
                <p>
                  the file holds your OpenPGP private key, protected with your mailbox key as its
                  passphrase. you can import it into GnuPG or Thunderbird, or open it in the offline
                  decryption tool, to read your end-to-end encrypted mail without vael. keep the
                  file as safe as the mailbox key itself.
                </p>
                <label>
                  mailbox key
                  <input
                    name="exportMailboxKey"
                    type="password"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={80}
                    value={currentKey}
                    onChange={(e) => setCurrentKey(e.target.value)}
                    disabled={busy}
                    data-sensitive
                  />
                </label>
              </>
            )}
            {flow === "contact" && (
              <>
                <p>
                  paste the sender&#39;s public key (it starts with &quot;-----BEGIN PGP PUBLIC KEY
                  BLOCK-----&quot;). it is used to encrypt to them and to check their signatures.
                </p>
                <label>
                  public key
                  <textarea
                    className="da-armor-input"
                    rows={8}
                    spellCheck={false}
                    autoComplete="off"
                    value={armor}
                    onChange={(e) => setArmor(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </>
            )}
            {flow === "disable" && step === "explain" && (
              <DisableExplainer
                status={s}
                cancelling={cancelling}
                onExport={() => open("export")}
              />
            )}
            {flow === "disable" && step === "verify" && (
              <>
                <div className="da-step-label">
                  step 2 of 2<span>confirm it&#39;s you</span>
                </div>
                <p>
                  you need your current mailbox key and your account number
                  {account.security.twoFactor ? ", plus your second factor" : ""}.
                </p>
                <label>
                  current mailbox key
                  <input
                    name="disableMailboxKey"
                    type="password"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={80}
                    value={currentKey}
                    onChange={(e) => setCurrentKey(e.target.value)}
                    disabled={busy}
                    data-sensitive
                  />
                </label>
                <VerificationFields
                  number={number}
                  factor={factor}
                  onNumber={setNumber}
                  onFactor={setFactor}
                  twoFactor={account.security.twoFactor}
                  busy={busy}
                />
                <label>
                  type &quot;{DISABLE_PHRASE}&quot; to confirm
                  <input
                    name="disablePhrase"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={80}
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </>
            )}
            {(flow === "enable" || flow === "change") && step === "verify" && (
              <>
                <div className="da-step-label">
                  step 1 of 3<span>confirm it&#39;s you</span>
                </div>
                {flow === "enable" ? (
                  <>
                    <p>
                      next you will see your new mailbox key once. save it before continuing; vael
                      never stores it. your OpenPGP key is made in this browser for your primary
                      address only; your aliases are never published or put on the key.
                    </p>
                    {imapClients > 0 && (
                      <>
                        <div className="da-enc-warning" role="note">
                          <WarningIcon size={18} aria-hidden />
                          <p>{imapClientsWarning(imapClients)}</p>
                        </div>
                        <label className="da-checkbox">
                          <input
                            type="checkbox"
                            checked={imapAck}
                            disabled={busy}
                            onChange={(e) => setImapAck(e.target.checked)}
                          />
                          i understand my mail apps will stop being able to read my mail
                        </label>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p>
                      you need your current mailbox key. the new key is shown once and only replaces
                      the current one after you confirm you saved it; then other browsers are locked
                      until they unlock with the new key.
                    </p>
                    <p className="da-small">{oldKeyCopy(days)}</p>
                    <label>
                      current mailbox key
                      <input
                        name="currentMailboxKey"
                        type="password"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={80}
                        value={currentKey}
                        onChange={(e) => setCurrentKey(e.target.value)}
                        disabled={busy}
                        data-sensitive
                      />
                    </label>
                  </>
                )}
                <VerificationFields
                  number={number}
                  factor={factor}
                  onNumber={setNumber}
                  onFactor={setFactor}
                  twoFactor={account.security.twoFactor}
                  busy={busy}
                />
              </>
            )}
            {issued && step === "save" && (
              <>
                <div className="da-step-label">
                  step 2 of 3<span>save your mailbox key</span>
                </div>
                <MailboxKeyDisplay groups={groups} />
                <div className="da-inline-actions">
                  <CopyButton value={groups.join("-")} label="copy key" />
                  <Button
                    onClick={() =>
                      downloadText(
                        "vael-mailbox-key.txt",
                        mailboxKeyFile(issued.key, data.mailbox.address),
                      )
                    }
                  >
                    <DownloadSimpleIcon size={16} aria-hidden />
                    download as .txt
                  </Button>
                </div>
                <div className="da-enc-warning" role="note">
                  <WarningIcon size={18} aria-hidden />
                  <p>
                    if you lose this key, your encrypted mail and your OpenPGP private key are gone
                    forever. vael does not keep a copy and support cannot recover it.
                    {flow === "enable" &&
                      " backups made before today still hold readable copies until they expire" +
                        (s.backupRetentionDays
                          ? " within " + s.backupRetentionDays + " days."
                          : " under our backup retention window.")}
                  </p>
                </div>
              </>
            )}
            {issued && step === "confirm" && (
              <>
                <div className="da-step-label">
                  step 3 of 3<span>check you saved it</span>
                </div>
                <p>
                  type groups {CONFIRM_GROUPS[0]} and {CONFIRM_GROUPS[1]} of your mailbox key from
                  your saved copy.
                </p>
                <div className="da-enc-confirm">
                  {CONFIRM_GROUPS.map((group, i) => (
                    <label key={group}>
                      group {group}
                      <input
                        name={"group" + group}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={9}
                        value={typed[i]}
                        onChange={(e) =>
                          setTyped((t) =>
                            i === 0 ? [e.target.value, t[1]] : [t[0], e.target.value],
                          )
                        }
                        disabled={busy}
                        data-sensitive
                      />
                    </label>
                  ))}
                </div>
                <label className="da-checkbox">
                  <input
                    type="checkbox"
                    checked={saved}
                    disabled={busy}
                    onChange={(e) => setSaved(e.target.checked)}
                  />
                  i saved my mailbox key somewhere safe; vael cannot recover it
                </label>
              </>
            )}
            {step === "working" && (
              <p role="status">
                {flow === "disable"
                  ? "turning off encryption…"
                  : flow === "enable"
                    ? "creating your OpenPGP key in this browser and turning on encryption…"
                    : "switching to your new mailbox key…"}
              </p>
            )}
            {step === "done" && (
              <>
                <p role="status">
                  your new mailbox key is active. this browser stays unlocked; other browsers are
                  locked until they unlock with the new key, and mail apps are disconnected.
                </p>
                <p className="da-small">{doneNote}</p>
              </>
            )}
            <InlineError message={error} />
            <DialogActions>
              <Button disabled={busy} onClick={close}>
                cancel
              </Button>
              {flow === "export" && (
                <Button
                  primary
                  busy={busy}
                  disabled={!currentKey.trim()}
                  onClick={() =>
                    void run(async () => {
                      const normalized = normalizeMailboxKey(currentKey);
                      setCurrentKey("");
                      if (!normalized)
                        throw new Error(
                          "that is not a mailbox key. it has 32 letters and digits in 8 groups.",
                        );
                      const result = await exportPrivateKey(normalized);
                      downloadText(
                        safeFileName(result.filename, "vael-openpgp-private-key.asc"),
                        result.armored,
                      );
                      if (mounted.current) reset();
                    })
                  }
                >
                  <DownloadSimpleIcon size={16} aria-hidden />
                  export private key
                </Button>
              )}
              {flow === "contact" && (
                <Button
                  primary
                  busy={busy}
                  disabled={!armor.includes("BEGIN PGP PUBLIC KEY BLOCK")}
                  onClick={() =>
                    void run(async () => {
                      const { inspectPublicKey } = await import("@/lib/encryption/pgp");
                      const key = await inspectPublicKey(armor).catch(() => {
                        throw new Error("that is not a valid OpenPGP public key.");
                      });
                      await addContactKey(key.armored);
                      if (mounted.current) reset();
                      await client.invalidateQueries({ queryKey: ["contact-keys"] });
                    })
                  }
                >
                  add key
                </Button>
              )}
              {flow === "disable" && step === "explain" && (
                <Button primary onClick={() => setStep("verify")}>
                  continue
                </Button>
              )}
              {flow === "disable" && step === "verify" && (
                <Button
                  danger
                  busy={busy}
                  disabled={!reauthReady || !currentKey.trim() || !disablePhraseMatches(phrase)}
                  onClick={() => void commitDisable()}
                >
                  {cancelling ? "cancel encryption" : "turn off encryption"}
                </Button>
              )}
              {(flow === "enable" || flow === "change") && step === "verify" && (
                <Button
                  primary
                  busy={busy}
                  disabled={
                    !reauthReady ||
                    (flow === "change" && !currentKey.trim()) ||
                    (flow === "enable" && imapClients > 0 && !imapAck)
                  }
                  onClick={() =>
                    void run(async () => {
                      const reauth = { accountKey: number, factor };
                      if (flow === "enable") {
                        const result = await beginEncryption(reauth);
                        if (mounted.current) setIssued(result);
                      } else {
                        const normalized = normalizeMailboxKey(currentKey);
                        setCurrentKey("");
                        if (!normalized)
                          throw new Error(
                            "that is not a mailbox key. it has 32 letters and digits in 8 groups.",
                          );
                        const result = await beginChangeKey(reauth, normalized);
                        if (!result.grant)
                          throw new Error("could not start the key change. try again.");
                        if (mounted.current) setIssued(result);
                      }
                      if (mounted.current) {
                        setNumber("");
                        setFactor("");
                        setStep("save");
                      }
                    })
                  }
                >
                  {flow === "enable" ? "show my mailbox key" : "create new key"}
                </Button>
              )}
              {issued && step === "save" && (
                <Button primary onClick={() => setStep("confirm")}>
                  i saved it, continue
                </Button>
              )}
              {issued && step === "confirm" && (
                <Button
                  primary
                  busy={busy}
                  disabled={!saved || !confirmGroupsMatch(issued.key, typed)}
                  onClick={() => void (flow === "enable" ? commitEnable() : commitChange())}
                >
                  {flow === "enable" ? "turn on encryption" : "switch to the new key"}
                </Button>
              )}
              {step === "done" && (
                <Button primary onClick={reset}>
                  done
                </Button>
              )}
            </DialogActions>
          </form>
        )}
      </AccountDialog>
    </>
  );
}

function MailboxKeyDisplay({ groups }: { groups: string[] }) {
  return (
    <ol className="da-mailbox-key" aria-label="your mailbox key, 8 groups">
      {groups.map((group, i) => (
        <li key={i}>
          <span aria-hidden>{i + 1}</span>
          <code translate="no">{group}</code>
        </li>
      ))}
    </ol>
  );
}

function EncryptionExplainer({
  retentionDays,
  children,
}: {
  retentionDays?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="da-enc-explainer">
      <div className="da-enc-table-scroll">
        <table className="da-enc-table">
          <caption className="sr-only">what changes when you turn it on</caption>
          <thead>
            <tr>
              <th scope="col">what</th>
              <th scope="col">today</th>
              <th scope="col">encrypted mailbox</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">stored mail and backups</th>
              <td>readable by our servers and operators</td>
              <td>stored encrypted with a key only you hold</td>
            </tr>
            <tr>
              <th scope="row">subjects, senders and previews in our index</th>
              <td>stored in plain text</td>
              <td>sealed; they need your key</td>
            </tr>
            <tr>
              <th scope="row">mail as it arrives</th>
              <td>our server sees it</td>
              <td>our server still sees it as it arrives, then stores it encrypted</td>
            </tr>
            <tr>
              <th scope="row">while you are signed in and unlocked</th>
              <td>the server reads mail to show it to you</td>
              <td>the same: the server decrypts in memory to show your mail</td>
            </tr>
            <tr>
              <th scope="row">OpenPGP mail in this webmail</th>
              <td>not available</td>
              <td>end-to-end: encrypted and decrypted in your browser only</td>
            </tr>
            <tr>
              <th scope="row">OpenPGP on the no-JavaScript site</th>
              <td>not available</td>
              <td>encrypted and decrypted on the server for that page, and labelled so</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="da-enc-points">
        <li>
          you get a mailbox key once. if you lose it, your encrypted mail and your OpenPGP private
          key are gone forever. support cannot help.
        </li>
        <li>
          after signing in you unlock your mailbox with the key. new mail still arrives and counts
          while you are locked.
        </li>
        <li>
          backups made before you turn this on keep readable copies until they expire
          {retentionDays ? " within " + retentionDays + " days" : ""}.
        </li>
        <li>
          your OpenPGP key carries only your primary address. your aliases are never published or
          linked to it.
        </li>
        <li>
          the telegram mini app and VaelMask verification codes cannot read an encrypted mailbox.
        </li>
        <li>
          you can turn it off again later with your mailbox key, your account number and second
          factor. your mail is then stored readable by our servers again, and your OpenPGP key is
          deleted.
        </li>
      </ul>
      {children}
    </div>
  );
}

function EncryptionSwitch({
  status,
  onTurnOn,
  onTurnOff,
}: {
  status: EncryptionStatus;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) {
  const id = useId();
  const on = status.state !== "off";
  const detail =
    status.state === "off"
      ? "your mail is stored readable by our servers, like most email. switch on to store it encrypted with a key only you hold."
      : status.state === "enabled"
        ? "stored mail is encrypted with your mailbox key. switching off needs that key, your account number and second factor."
        : status.state === "migrating"
          ? "your existing mail is being encrypted. switching off now cancels it."
          : "your mail is being stored readable by our servers again. this can't be stopped; you can switch encryption on later with a new key.";
  return (
    <div className="da-setting-row da-enc-switch">
      <div>
        <h3 id={id + "-label"}>encrypted mailbox: {stateLabels[status.state]}</h3>
        <p id={id + "-detail"}>{detail}</p>
      </div>
      <input
        className="wm-switch"
        type="checkbox"
        role="switch"
        aria-labelledby={id + "-label"}
        aria-describedby={id + "-detail"}
        checked={on}
        disabled={status.state === "disabling"}
        onChange={() => (on ? onTurnOff() : onTurnOn())}
      />
    </div>
  );
}

function DisableExplainer({
  status,
  cancelling,
  onExport,
}: {
  status: EncryptionStatus;
  cancelling: boolean;
  onExport: () => void;
}) {
  return (
    <>
      <div className="da-step-label">
        step 1 of 2<span>what changes</span>
      </div>
      <p>
        {cancelling
          ? "your mail is still being encrypted. cancelling stops that and turns encryption off:"
          : "when you turn the encrypted mailbox off:"}
      </p>
      <ul className="da-enc-points">
        <li>
          your mail is stored readable by our servers again, like before you turned encryption on.
          so are the subjects, people and previews in our index, and backups made from now on.
        </li>
        <li>
          your OpenPGP key is deleted and no longer published. new OpenPGP mail can&#39;t be sent to
          you, and OpenPGP messages you already have can only be read with an exported copy of the
          key.
        </li>
        <li>
          your mailbox key becomes useless. if you turn encryption on again later, you get a new
          key.
        </li>
        <li>
          mail apps are disconnected and reconnect by themselves; they can read your mail again once
          it is stored readable.
        </li>
        <li>
          your existing mail is saved again in the background. keep a browser unlocked until it
          finishes; nothing is deleted before its readable copy is checked.
        </li>
      </ul>
      {status.pgp && (
        <div className="da-setting-row">
          <div>
            <h3>export your OpenPGP private key first</h3>
            <p>
              {status.unlocked
                ? "keep a copy to read the OpenPGP mail you already have, in GnuPG, Thunderbird or the offline tool."
                : "unlock this browser to export it before you continue."}
            </p>
          </div>
          <Button disabled={!status.unlocked} onClick={onExport}>
            <DownloadSimpleIcon size={16} aria-hidden />
            export my OpenPGP private key
          </Button>
        </div>
      )}
    </>
  );
}

function EncryptionDisabling({
  status,
  onAddContact,
}: {
  status: EncryptionStatus;
  onAddContact: () => void;
}) {
  const id = useId();
  const { total, done } = status.migrate || { total: 0, done: 0 };
  const error = status.migrate?.error;
  return (
    <>
      <div className="da-enc-progress" aria-labelledby={id + "-progress"}>
        <p id={id + "-progress"} role="status">
          {error
            ? migrateErrorCopy(error, "decrypt")
            : total
              ? `${done} of ${total} messages stored readable again`
              : "preparing…"}
        </p>
        <progress
          value={Math.min(done, total)}
          max={Math.max(1, total)}
          aria-label="existing mail stored readable again"
          aria-valuetext={`${done} of ${total} messages`}
        />
        {!status.unlocked ? (
          <>
            <p className="da-small">
              this browser is locked. unlocking with your mailbox key lets the work continue and
              lets you read mail that is not done yet.
            </p>
            <Button primary onClick={openUnlockPrompt}>
              <LockSimpleOpenIcon size={16} aria-hidden />
              unlock to continue
            </Button>
          </>
        ) : (
          error &&
          error !== "locked" && <Button onClick={openUnlockPrompt}>retry (unlock again)</Button>
        )}
      </div>
      <ContactKeys onAdd={onAddContact} />
    </>
  );
}

function EncryptionOn({
  status,
  onChangeKey,
  onAddContact,
  onExport,
  refresh,
}: {
  status: EncryptionStatus;
  onChangeKey: () => void;
  onAddContact: () => void;
  onExport: () => void;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [downloading, setDownloading] = useState(false),
    [error, setError] = useState("");
  const id = useId();
  const migrating = status.state === "migrating";
  const { total, done } = status.migrate || { total: 0, done: 0 };
  const migrateError = status.migrate?.error;
  return (
    <>
      <div className="da-setting-row">
        <div>
          <h3>
            {migrating ? "encrypting your existing mail" : "this browser"}{" "}
            <span className={"da-status-pill" + (status.unlocked ? " enabled" : "")}>
              {status.unlocked ? (
                <LockSimpleOpenIcon size={13} aria-hidden />
              ) : (
                <LockSimpleIcon size={13} aria-hidden />
              )}
              {status.unlocked ? "unlocked in this browser" : "locked"}
            </span>
          </h3>
          <p>
            {status.unlocked
              ? "this session can read your mail. lock it when you step away; reading again needs your mailbox key."
              : "your stored mail stays encrypted until you unlock with your mailbox key."}
          </p>
        </div>
        {status.unlocked ? (
          <Button
            busy={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void lockMailbox()
                .then(refresh)
                .catch((e) => setError((e as Error).message || "could not lock. try again."))
                .finally(() => setBusy(false));
            }}
          >
            <LockSimpleIcon size={16} aria-hidden />
            lock now
          </Button>
        ) : (
          <Button primary onClick={openUnlockPrompt}>
            <LockSimpleOpenIcon size={16} aria-hidden />
            unlock
          </Button>
        )}
      </div>
      {migrating && (
        <div className="da-enc-progress" aria-labelledby={id + "-progress"}>
          <p id={id + "-progress"}>
            {migrateError
              ? migrateErrorCopy(migrateError, "encrypt")
              : total
                ? `${done} of ${total} messages encrypted`
                : "preparing…"}
          </p>
          <progress
            value={Math.min(done, total)}
            max={Math.max(1, total)}
            aria-label="existing mail encrypted"
            aria-valuetext={`${done} of ${total} messages encrypted`}
          />
          {migrateError === "locked" && (
            <Button onClick={openUnlockPrompt}>unlock to continue</Button>
          )}
        </div>
      )}
      <InlineError message={error} />
      <div className="da-setting-row">
        <div>
          <h3>change mailbox key</h3>
          <p>
            needs your current key and your account number. you save the new key the same way as
            before. {oldKeyCopy(backupRetention(status))}
          </p>
        </div>
        <Button disabled={!status.unlocked} onClick={onChangeKey}>
          change key
        </Button>
      </div>
      {status.pgp && (
        <div className="da-setting-row">
          <div>
            <h3>your OpenPGP key</h3>
            <p>
              people can find it by your primary address and send you end-to-end encrypted mail. it
              carries only that address: your aliases are never published or linked to it. its
              private part is locked with your mailbox key.
            </p>
            <code className="da-fingerprint" translate="no">
              {formatFingerprint(status.pgp.fingerprint)}
            </code>
          </div>
          <div className="da-inline-actions">
            <Button
              busy={downloading}
              onClick={() => {
                setDownloading(true);
                setError("");
                void publicKeyArmor()
                  .catch(() => ({
                    armored: status.pgp!.publicKey,
                    fingerprint: status.pgp!.fingerprint,
                  }))
                  .then((key) => {
                    if (!key.armored) throw new Error("the public key is not available.");
                    downloadText("vael-openpgp-public-key.asc", key.armored);
                  })
                  .catch((e) => setError((e as Error).message))
                  .finally(() => setDownloading(false));
              }}
            >
              <DownloadSimpleIcon size={16} aria-hidden />
              download public key
            </Button>
            <Button onClick={onExport}>export my OpenPGP private key</Button>
          </div>
        </div>
      )}
      {status.pgp && (
        <div className="da-setting-row">
          <div>
            <h3>offline decryption tool</h3>
            <p>
              a single file that decrypts your exported mail with your exported private key,
              entirely on your device. download it and open it from your computer, not from this
              site.
            </p>
            {OFFLINE_TOOL_SHA256 && (
              <p className="da-small">
                check this before opening the file: its SHA-256 must be{" "}
                <code className="da-fingerprint" translate="no">
                  {OFFLINE_TOOL_SHA256}
                </code>{" "}
                (for example <code>shasum -a 256 vael-decrypt.html</code>).
              </p>
            )}
          </div>
          <a className="wm-button" href="/tools/vael-decrypt.html" download="vael-decrypt.html">
            <DownloadSimpleIcon size={16} aria-hidden />
            download the tool
          </a>
        </div>
      )}
      <ContactKeys onAdd={onAddContact} />
    </>
  );
}

function ContactKeys({ onAdd }: { onAdd: () => void }) {
  const client = useQueryClient();
  const keys = useQuery({
    queryKey: ["contact-keys"],
    queryFn: ({ signal }) => listContactKeys(signal),
    retry: false,
  });
  return (
    <div className="da-enc-contacts">
      <div className="da-setting-row">
        <div>
          <h3>contact keys</h3>
          <p>
            public keys you added by hand. vael also finds keys in its own directory and through web
            key directory (WKD).
          </p>
        </div>
        <Button onClick={onAdd}>add a key</Button>
      </div>
      {keys.isPending && (
        <p className="da-muted" role="status">
          loading contact keys…
        </p>
      )}
      {keys.error && <InlineError message="contact keys could not be loaded." />}
      {keys.data && !keys.data.length && <p className="da-empty-message">no contact keys yet.</p>}
      {keys.data?.map((key: ContactKey) => (
        <div className="da-setting-row" key={key.id}>
          <div>
            <h3 data-sensitive>{key.email}</h3>
            <p>
              <code className="da-fingerprint" translate="no">
                {formatFingerprint(key.fingerprint)}
              </code>
              {key.createdAt ? " · added " + dateLabel(key.createdAt) : ""}
            </p>
          </div>
          <Confirm
            title="remove this key?"
            description={`you will no longer encrypt to ${key.email} with this key unless it is found in a directory.`}
            trigger={(open) => <Button onClick={open}>remove</Button>}
            action={async () => {
              await deleteContactKey(key.id);
              await client.invalidateQueries({ queryKey: ["contact-keys"] });
            }}
          />
        </div>
      ))}
    </div>
  );
}
