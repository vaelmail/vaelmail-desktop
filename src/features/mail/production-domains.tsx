import { useContext, useState } from "react";
import { openHref } from "@/shell/store";
import { toast } from "sonner";
import type { Domain } from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import { OverlayClassContext, Button, Confirm, Empty, Modal } from "@/ui/controls";
import { useWindowCloseGuard } from "@/shell/close-guard";
import { saveOpenDrafts } from "@/lib/workspace-navigation";

export function ProductionDomains({ embedded = false }: { embedded?: boolean }) {
  const { data, request, refresh } = useMail();
  const accountView = useContext(OverlayClassContext) === "da-overlay";
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const Heading = embedded ? "h2" : "h1";
  const allowed = data.capabilities.domains > 0;
  return (
    <section className={embedded ? "wm-resource-embedded" : "wm-resource-page"}>
      <div className="wm-page-heading">
        <div>
          <Heading>custom domains</Heading>
          <p className="wm-muted">
            receive mail from your own domain in this inbox. add up to three domains and 25
            receiving addresses per domain.
          </p>
        </div>
        <Button
          primary
          disabled={!allowed || data.resources.domains.length >= 3}
          onClick={() => {
            setName("");
            setError("");
            setAdding(true);
          }}
        >
          add domain
        </Button>
      </div>
      {!allowed && (
        <div
          style={{
            margin: "14px 0",
            padding: "12px 16px",
            background: "var(--w-surface, #f9f9f9)",
            border: "1px dashed var(--w-line, #ccc)",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>Custom domains require Vael Plus.</strong> Connect up to 3 custom domains and
            send/receive from your own domain.
          </span>
          <Button
            primary
            onClick={() => {
              void saveOpenDrafts()
                .then(() => openHref("/dashboard/billing"))
                .catch((error) =>
                  toast.error(
                    error instanceof Error ? error.message : "save your draft before continuing",
                  ),
                );
            }}
          >
            get plus (€5 / mo) ↗
          </Button>
        </div>
      )}
      {accountView && (
        <ol className="da-domain-steps" aria-label="domain setup steps">
          <li>add a domain</li>
          <li>publish DNS</li>
          <li>verify records</li>
          <li>add addresses</li>
        </ol>
      )}
      <p className="wm-muted">
        DNS is checked daily. missing proof or MX records pause receiving. temporary DNS failures
        allow up to 48 hours from the last successful check. sending uses your primary vael.email
        address.
      </p>
      {data.resources.domains.length === 0 && (
        <Empty
          title="no custom domains yet"
          description="add a domain you control, then publish its verification and mail records."
        />
      )}
      <div className="wm-domain-list">
        {data.resources.domains.map((domain) => (
          <DomainDetails key={domain.id} domain={domain} allowed={allowed} />
        ))}
      </div>
      <Modal
        open={adding}
        onClose={() => {
          if (!busy) setAdding(false);
        }}
        title="add a custom domain"
      >
        <form
          className="wm-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("domains", "POST", {
                name: name.trim().toLowerCase(),
                order: data.resources.domains.length,
              });
              await refresh();
              setAdding(false);
              toast.success("domain added; publish the DNS records below");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            domain name
            <input
              autoFocus
              required
              maxLength={253}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="example.com"
              disabled={busy}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && (
            <p className="wm-field-error" role="alert">
              {error}
            </p>
          )}
          <div className="wm-modal-actions">
            <Button disabled={busy} onClick={() => setAdding(false)}>
              cancel
            </Button>
            <Button type="submit" primary busy={busy}>
              add domain
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function DomainDetails({ domain, allowed }: { domain: Domain; allowed: boolean }) {
  const { request, refresh } = useMail();
  const accountView = useContext(OverlayClassContext) === "da-overlay";
  const [local, setLocal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const recipients = domain.recipients ?? [];
  useWindowCloseGuard(() => {
    if (busy || local)
      throw new Error("Finish or clear the domain recipient form before closing Domains.");
  });
  const status =
    domain.verificationState === "warning"
      ? domain.verified
        ? "DNS check unavailable · receiving continues temporarily"
        : "DNS check unavailable · receiving paused"
      : domain.verified
        ? "verified · receiving enabled"
        : domain.verificationState === "disabled"
          ? "DNS verification expired or missing · receiving paused"
          : "waiting for DNS verification";
  const check = async () => {
    setBusy(true);
    setError("");
    try {
      await request("domains/" + domain.id + "/verify", "POST", {});
      await refresh();
      toast.success("DNS verified");
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="wm-domain-detail" aria-label={domain.name}>
      <div className="wm-domain-heading">
        <div>
          <h3>{domain.name}</h3>
          <p className="wm-muted" role="status">
            {status}
          </p>
        </div>
        <Button disabled={!allowed} busy={busy} onClick={() => void check()}>
          check DNS
        </Button>
      </div>
      <div className="wm-dns-record">
        <p>
          publish these records with your domain&#39;s DNS provider. keep the verification record in
          place.
        </p>
        <dl className="wm-domain-records">
          <dt>TXT name</dt>
          <dd>
            <code translate="no">_vael-verification.{domain.name}</code>
            {accountView && (
              <CopyRecord label="copy TXT name" value={"_vael-verification." + domain.name} />
            )}
          </dd>
          <dt>TXT value</dt>
          <dd>
            <code translate="no">vael-verification={domain.token}</code>
            {accountView && (
              <CopyRecord label="copy TXT value" value={"vael-verification=" + domain.token} />
            )}
          </dd>
          <dt>MX name</dt>
          <dd>
            <code translate="no">{domain.name}</code>
            {accountView && <CopyRecord label="copy MX name" value={domain.name} />}
          </dd>
          <dt>MX server</dt>
          <dd>
            <code translate="no">mail.vael.email</code> · priority 10
            {accountView && <CopyRecord label="copy MX server" value="mail.vael.email" />}
          </dd>
        </dl>
      </div>
      <h4>receiving addresses · {recipients.length}/25</h4>
      {recipients.length === 0 && (
        <p className="wm-muted">
          no addresses yet. verify DNS, then add the addresses that should arrive in this inbox.
          other recipients are rejected.
        </p>
      )}
      <ul className="wm-domain-recipients">
        {recipients.map((recipient) => (
          <li key={recipient.id}>
            <code>{recipient.address}</code>
            <Confirm
              title="remove receiving address?"
              description={
                recipient.address +
                " will stop accepting new mail. existing messages stay in your inbox."
              }
              trigger={(open) => <Button onClick={open}>remove</Button>}
              action={async () => {
                await request("domains/" + domain.id + "/recipients/" + recipient.id, "DELETE");
                await refresh();
              }}
            />
          </li>
        ))}
      </ul>
      <form
        className="wm-form wm-domain-add-recipient"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await request("domains/" + domain.id + "/recipients", "POST", {
              local: local.trim().toLowerCase(),
            });
            await refresh();
            setLocal("");
            toast.success("receiving address added");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          address before @{domain.name}
          <input
            required
            maxLength={64}
            pattern="[a-z0-9]+([._\-][a-z0-9]+)*"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="hello"
            value={local}
            disabled={
              busy || !allowed || !domain.verified || domain.verificationState !== "verified"
            }
            onChange={(event) => setLocal(event.target.value)}
          />
        </label>
        <Button
          type="submit"
          busy={busy}
          disabled={
            !allowed ||
            !domain.verified ||
            domain.verificationState !== "verified" ||
            recipients.length >= 25
          }
        >
          add address
        </Button>
      </form>
      {error && (
        <p className="wm-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="wm-domain-footer">
        <Confirm
          title="remove domain?"
          description={
            "all receiving addresses at " +
            domain.name +
            " will stop accepting mail. existing messages stay in your inbox."
          }
          trigger={(open) => (
            <Button danger onClick={open}>
              remove domain
            </Button>
          )}
          action={async () => {
            await request("domains/" + domain.id, "DELETE");
            await refresh();
          }}
        />
      </div>
    </article>
  );
}

function CopyRecord({ label, value }: { label: string; value: string }) {
  return (
    <Button
      aria-label={label}
      onClick={() =>
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success("DNS value copied"))
          .catch(() => toast.error("clipboard unavailable; select and copy the value"))
      }
    >
      copy
    </Button>
  );
}
