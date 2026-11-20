import { useRef, useState } from "react";
import {
  CopyIcon,
  DotsThreeIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TagIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { WorkspaceLink } from "@/shell/app-link";
import type { Alias } from "@/lib/mail/types";
import { aliasSendingNote } from "@/lib/mail-domains";
import { useMail } from "@/features/mailbox/context";
import { ResourceForm } from "./alias-shared";
import { Button, Confirm, Dropdown, Empty, IconButton, MailLink, Modal } from "@/ui/controls";

export function AliasesPanel({ embedded = false }: { embedded?: boolean }) {
  const { data, request, refresh } = useMail();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [edit, setEdit] = useState<Alias | "new" | null>(null);
  const [pause, setPause] = useState<Alias | null>(null);
  const [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const aliases = data.resources.aliases;
  const rows = aliases
    .filter(
      (a) =>
        `${a.address} ${a.description}`.toLowerCase().includes(query.toLowerCase()) &&
        (status === "all" || a.enabled === (status === "active")),
    )
    .sort((a, b) => a.order - b.order);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("address copied");
    } catch {
      toast.error("clipboard unavailable; select the address to copy it");
    }
  };
  const close = () => {
    if (dirty.current) setDiscard(true);
    else setEdit(null);
  };
  const update = async (alias: Alias) => {
    setBusy(true);
    try {
      await request(`aliases/${alias.id}`, "PATCH", {
        ...alias,
        enabled: !alias.enabled,
      });
      await refresh();
      setPause(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const Heading = embedded ? "h2" : "h1";
  return (
    <section className={`wm-aliases ${embedded ? "wm-resource-embedded" : "wm-resource-page"}`}>
      <div className="wm-page-heading">
        <div>
          <Heading>aliases</Heading>
          <p className="wm-muted">Different addresses. One private inbox.</p>
        </div>
        <Button primary onClick={() => setEdit("new")}>
          <PlusIcon size={16} />
          create alias
        </Button>
      </div>
      {!embedded && (
        <div className="wm-alias-primary">
          <span className="wm-muted">main address</span>
          <code translate="no">{data.mailbox.address}</code>
          <IconButton label="copy main address" onClick={() => void copy(data.mailbox.address)}>
            <CopyIcon size={17} />
          </IconButton>
        </div>
      )}
      <div className="wm-alias-allowance">
        <span>
          custom{" "}
          <strong>
            {aliases.filter((a) => !a.generated).length} / {data.capabilities.customAliases}
          </strong>
        </span>
        <span>
          random{" "}
          <strong>
            {aliases.filter((a) => a.generated).length} /{" "}
            {data.mailbox.plan === "plus" ? "unlimited" : data.capabilities.generatedAliases}
          </strong>
        </span>
        <small>{aliasSendingNote}</small>
        {data.mailbox.plan === "free" && (
          <WorkspaceLink
            href="/dashboard/billing"
            style={{ marginLeft: "auto", fontSize: "11px", color: "var(--w-accent)" }}
          >
            need more? get plus ↗
          </WorkspaceLink>
        )}
      </div>
      <div className="wm-alias-filters">
        <label>
          <MagnifyingGlassIcon size={17} />
          <input
            aria-label="search aliases"
            placeholder="find an address or description"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div role="group" aria-label="filter aliases">
          {["all", "active", "paused"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {!rows.length ? (
        <Empty
          title={aliases.length ? "no matching aliases" : "an address for every part of your life"}
          description={
            aliases.length
              ? "try another search or status."
              : "create a random address for a service, or choose a name of your own."
          }
        />
      ) : (
        <div className="wm-alias-list">
          {rows.map((alias) => (
            <div className="wm-alias-row" key={alias.id}>
              <span className="wm-alias-mark">
                <TagIcon size={20} />
              </span>
              <div className="wm-alias-details">
                <code translate="no">{alias.address}</code>
                <p>{alias.description || (alias.generated ? "random alias" : "custom alias")}</p>
              </div>
              <span className={`wm-badge ${alias.enabled ? "enabled" : ""}`}>
                {alias.enabled ? "active" : "paused"}
              </span>
              <IconButton label={`copy ${alias.address}`} onClick={() => void copy(alias.address)}>
                <CopyIcon size={17} />
              </IconButton>
              <MailLink
                className="wm-icon"
                href={`/webmail/aliases/${alias.id}`}
                aria-label={`view mail for ${alias.address}`}
              >
                <EnvelopeIcon size={18} />
              </MailLink>
              <Dropdown
                label={`options for ${alias.address}`}
                items={[
                  { label: "edit", action: () => setEdit(alias) },
                  {
                    label: alias.enabled ? "pause receiving" : "resume receiving",
                    action: () => {
                      if (alias.enabled) setPause(alias);
                      else void update(alias);
                    },
                  },
                ]}
              >
                <DotsThreeIcon size={21} />
              </Dropdown>
              <Confirm
                title="remove this alias?"
                description={
                  alias.generated
                    ? "this random address is permanently retired. existing messages are kept."
                    : "this custom address stops receiving and may become available to others after its reservation period. existing messages are kept."
                }
                trigger={(open) => (
                  <IconButton label={`remove ${alias.address}`} onClick={open}>
                    ×
                  </IconButton>
                )}
                action={async () => {
                  await request(`aliases/${alias.id}`, "DELETE");
                  await refresh();
                }}
              />
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={close} title={edit === "new" ? "create alias" : "edit alias"}>
        {edit && (
          <ResourceForm
            key={edit === "new" ? "new" : edit.id}
            collection="aliases"
            value={edit === "new" ? undefined : edit}
            done={() => {
              dirty.current = false;
              setEdit(null);
            }}
            cancel={close}
            onDirty={(value) => {
              dirty.current = value;
            }}
          />
        )}
      </Modal>
      <Modal open={discard} onClose={() => setDiscard(false)} title="discard these changes?">
        <p>your unsaved alias changes will be lost.</p>
        <Button onClick={() => setDiscard(false)}>keep editing</Button>
        <Button
          onClick={() => {
            dirty.current = false;
            setDiscard(false);
            setEdit(null);
          }}
        >
          discard changes
        </Button>
      </Modal>
      <Modal
        open={!!pause}
        onClose={() => {
          if (!busy) setPause(null);
        }}
        title="pause receiving?"
        description="new mail to this address will be rejected. existing messages are kept."
      >
        {pause && (
          <>
            <p className="wm-muted">
              {data.resources.services
                .filter((s) => s.aliasIds.includes(pause.id))
                .map((s) => s.name)
                .join(", ") || "all services using this address"}{" "}
              will be affected.
            </p>
            <Button busy={busy} onClick={() => void update(pause)}>
              pause alias
            </Button>
          </>
        )}
      </Modal>
    </section>
  );
}
