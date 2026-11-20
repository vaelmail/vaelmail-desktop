import { VaelSelect } from "@/ui/select";
import { useRef, useState, type ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  CopyIcon,
  DotsSixVerticalIcon,
  DotsThreeIcon,
  EnvelopeIcon,
  PlusIcon,
  StarIcon,
  TagIcon,
} from "@phosphor-icons/react";
import { initials, type Collection, type Resource } from "@/lib/mail/types";
import { aliasSendingNote, receiveOnlyAliasDomains } from "@/lib/mail-domains";
import { useMail } from "@/features/mailbox/context";
import { WorkspaceLink } from "@/shell/app-link";
import { Button, Confirm, Dropdown, Empty, IconButton, Modal } from "@/ui/controls";
import { ProductionDomains } from "./production-domains";
import { AliasesPanel } from "./aliases";
import { ResourceForm } from "./alias-shared";
const titles: Record<Collection, string> = {
  services: "services",
  contacts: "contacts",
  aliases: "aliases",
  domains: "custom domains",
  identities: "sending identities",
  folders: "folders",
  labels: "labels",
  rules: "rules",
  "saved-searches": "saved searches",
};
export function ResourcesPanel({
  collection,
  embedded = false,
}: {
  collection: Collection;
  embedded?: boolean;
}) {
  if (collection === "aliases") return <AliasesPanel embedded={embedded} />;
  return collection === "domains" ? (
    <ProductionDomains embedded={embedded} />
  ) : (
    <GenericResourcesPanel collection={collection} embedded={embedded} />
  );
}
function GenericResourcesPanel({
  collection,
  embedded = false,
}: {
  collection: Collection;
  embedded?: boolean;
}) {
  const { data, request, refresh, compose } = useMail();
  const Heading = embedded ? "h2" : "h1";
  const dirty = useRef(false),
    [discard, setDiscard] = useState(false);
  const [pauseWarning, setPauseWarning] = useState<Resource | null>(null);
  const closeEditor = () => {
    if (dirty.current) setDiscard(true);
    else setEdit(null);
  };
  const [edit, setEdit] = useState<Resource | "new" | null>(null),
    [query, setQuery] = useState(""),
    [favorites, setFavorites] = useState(false),
    [previewRule, setPreviewRule] = useState<{
      id: string;
      count: number;
      subjects: string[];
    } | null>(null);
  const rows = [...data.resources[collection]]
    .sort((a, b) => a.order - b.order)
    .filter(
      (r) =>
        JSON.stringify(r).toLowerCase().includes(query.toLowerCase()) &&
        (collection !== "contacts" || !favorites || ("favorite" in r && r.favorite)),
    );
  const update = async (row: Resource, patch: object) => {
    if (
      collection === "aliases" &&
      "enabled" in patch &&
      patch.enabled === false &&
      data.resources.services.filter((s) => s.aliasIds.includes(row.id)).length > 1
    ) {
      setPauseWarning(row);
      return;
    }
    try {
      await request(collection + "/" + row.id, "PATCH", { ...row, ...patch });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const reorder = async (id: string, index: number) => {
    const all = [...data.resources[collection]].sort((a, b) => a.order - b.order),
      old = all.findIndex((r) => r.id === id);
    const next = all.slice();
    const [moved] = next.splice(old, 1);
    if (moved) next.splice(index, 0, moved);
    try {
      await request(collection + "/order", "POST", {
        ids: next.map((r) => r.id),
      });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const copy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("address copied");
    } catch {
      toast.error("clipboard unavailable; select and copy the address");
    }
  };
  return (
    <section className={embedded ? "wm-resource-embedded" : "wm-resource-page"}>
      <div className="wm-page-heading">
        <div>
          <Heading>{titles[collection]}</Heading>
          <p className="wm-muted">
            {collection === "aliases"
              ? "extra addresses, all arriving in one inbox. " + aliasSendingNote
              : collection === "domains"
                ? "verify your TXT proof and MX records before receiving mail on a custom domain. domains are receive-only."
                : collection === "rules"
                  ? "rules run in order on incoming mail. moving, archiving or marking spam ends the chain."
                  : rows.length + (rows.length === 1 ? " item" : " items")}
          </p>
          {data.filtering?.pending && ["rules", "services"].includes(collection) && (
            <p className="wm-muted" role="status">
              {data.filtering.error
                ? "Filter update failed. Previous filters remain active."
                : "Filter updates are being applied. Previous filters remain active until then."}
              {data.filtering.error && (
                <Button
                  onClick={() => {
                    void request("rules/retry", "POST", {})
                      .then(refresh)
                      .catch((e) => toast.error(e.message));
                  }}
                >
                  retry
                </Button>
              )}
            </p>
          )}
        </div>
        {collection === "identities" ? null : (
          <Button
            primary
            disabled={collection === "domains" && !data.capabilities.domains}
            onClick={() => setEdit("new")}
          >
            <PlusIcon size={16} />
            add{" "}
            {collection === "saved-searches"
              ? "search"
              : collection === "aliases"
                ? "alias"
                : collection.replace(/s$/, "")}
          </Button>
        )}
      </div>
      {collection === "aliases" && (
        <div className="wm-quota-row">
          <span>
            custom{" "}
            <strong>
              {data.resources.aliases.filter((a) => !a.generated).length}/
              {data.capabilities.customAliases}
            </strong>
          </span>
          <span>
            random{" "}
            <strong>
              {data.resources.aliases.filter((a) => a.generated).length}/
              {data.mailbox.plan === "plus" ? "unlimited" : data.capabilities.generatedAliases}
            </strong>
          </span>
          <span>{receiveOnlyAliasDomains.map((d) => "@" + d).join(", ")} receive only</span>
        </div>
      )}
      {!embedded && (
        <div className="wm-resource-filter">
          <input
            aria-label={"search " + collection}
            placeholder={"find " + collection}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {collection === "contacts" && (
            <Button aria-pressed={favorites} onClick={() => setFavorites(!favorites)}>
              <StarIcon size={16} />
              favorites
            </Button>
          )}
          {collection === "contacts" && <ContactCSV />}
        </div>
      )}
      {!rows.length ? (
        <Empty
          title={"a place for " + titles[collection] + "."}
          description={
            query ? "no matches. try another name." : "add your first one when you're ready."
          }
        />
      ) : (
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled) return;
            const source = event.operation.source,
              target = event.operation.target;
            if (source && target && source.id !== target.id) {
              const i = data.resources[collection].findIndex((r) => r.id === String(target.id));
              if (i >= 0) void reorder(String(source.id), i);
            }
          }}
        >
          <div className="wm-resource-list">
            {rows.map((row, index) => {
              const name = "name" in row ? row.name : "address" in row ? row.address : "item";
              const subtitle =
                "emails" in row
                  ? row.emails.join(", ")
                  : "description" in row
                    ? row.description || (row.generated ? "random alias" : "custom alias")
                    : "email" in row
                      ? row.email
                      : "query" in row
                        ? row.query
                        : "conditions" in row
                          ? row.conditions.length +
                            " conditions · " +
                            row.actions.length +
                            " actions"
                          : "verified" in row
                            ? row.verified
                              ? "verified in demo"
                              : "pending demo verification"
                            : "";
              return (
                <SortableRow key={row.id} id={row.id} index={index} disabled={!!query || favorites}>
                  <span
                    className={
                      "wm-avatar " + (collection === "labels" && "color" in row ? row.color : "")
                    }
                  >
                    {collection === "contacts" ? (
                      initials(name)
                    ) : collection === "aliases" ? (
                      <TagIcon size={18} />
                    ) : (
                      <span className="wm-dot" />
                    )}
                  </span>
                  <button type="button" className="wm-resource-name" onClick={() => setEdit(row)}>
                    <strong>{name}</strong>
                    <span>{subtitle}</span>
                  </button>
                  {"enabled" in row && (
                    <span className={"wm-badge " + (row.enabled ? "enabled" : "")}>
                      {row.enabled ? "active" : "paused"}
                    </span>
                  )}
                  {"favorite" in row && (
                    <IconButton
                      label={row.favorite ? "remove favorite" : "favorite contact"}
                      className={row.favorite ? "starred" : ""}
                      onClick={() => void update(row, { favorite: !row.favorite })}
                    >
                      <StarIcon size={18} weight={row.favorite ? "fill" : "regular"} />
                    </IconButton>
                  )}
                  {"emails" in row && (
                    <IconButton
                      label={"write to " + name}
                      onClick={() =>
                        void compose({
                          to: [{ name: row.name, email: row.emails[0] ?? "" }],
                        })
                      }
                    >
                      <EnvelopeIcon size={18} />
                    </IconButton>
                  )}
                  {"address" in row && (
                    <>
                      <WorkspaceLink
                        className="wm-icon"
                        aria-label={"view mail for " + row.address}
                        href={"/webmail/aliases/" + row.id}
                      >
                        <EnvelopeIcon size={18} />
                      </WorkspaceLink>
                      <IconButton label="copy alias" onClick={() => void copy(row.address)}>
                        <CopyIcon size={17} />
                      </IconButton>
                    </>
                  )}
                  {collection === "domains" && "verified" in row && !row.verified && (
                    <Button
                      disabled={!data.capabilities.domains}
                      onClick={() => {
                        void request("domains/" + row.id + "/verify", "POST", {})
                          .then(refresh)
                          .then(() => toast.success("DNS verified"))
                          .catch((e) => toast.error(e.message));
                      }}
                    >
                      {"check DNS"}
                    </Button>
                  )}
                  <Dropdown
                    label={"options for " + name}
                    items={[
                      { label: "edit", action: () => setEdit(row) },
                      ...("enabled" in row
                        ? [
                            {
                              label: row.enabled ? "pause" : "enable",
                              action: () => void update(row, { enabled: !row.enabled }),
                            },
                          ]
                        : []),
                      {
                        label: "move up",
                        action: () => void reorder(row.id, Math.max(0, index - 1)),
                        disabled: index === 0,
                      },
                      {
                        label: "move down",
                        action: () => void reorder(row.id, index + 1),
                        disabled: index === rows.length - 1,
                      },
                      ...(collection === "rules"
                        ? [
                            {
                              label: "preview on existing mail",
                              action: () => {
                                void request<{
                                  count: number;
                                  subjects: string[];
                                }>("rules/" + row.id + "/apply", "POST", {
                                  apply: false,
                                })
                                  .then((result) => setPreviewRule({ ...result, id: row.id }))
                                  .catch((e) => toast.error(e.message));
                              },
                            },
                          ]
                        : []),
                    ]}
                  >
                    <DotsThreeIcon size={21} />
                  </Dropdown>
                  {collection === "identities" ? null : (
                    <Confirm
                      title={"remove this " + collection.replace(/s$/, "") + "?"}
                      description={
                        collection === "folders"
                          ? "mail in this folder returns to the inbox. rules using this folder are disabled."
                          : collection === "labels"
                            ? "the label is removed from mail. messages are kept and rules using this label are disabled."
                            : collection === "domains"
                              ? "receive-only recipients on this domain are retired. existing mail is preserved."
                              : "this item will be removed."
                      }
                      trigger={(open) => (
                        <IconButton label={"remove " + name} onClick={open}>
                          <span aria-hidden="true">×</span>
                        </IconButton>
                      )}
                      action={async () => {
                        try {
                          await request(collection + "/" + row.id, "DELETE");
                          await refresh();
                        } catch (e) {
                          toast.error((e as Error).message);
                          throw e;
                        }
                      }}
                    />
                  )}
                </SortableRow>
              );
            })}
          </div>
        </DragDropProvider>
      )}
      <Modal
        open={!!pauseWarning}
        onClose={() => setPauseWarning(null)}
        title="pause a shared alias?"
        description={
          "this stops future mail for all associated services: " +
          data.resources.services
            .filter((s) => s.aliasIds.includes(pauseWarning?.id || ""))
            .map((s) => s.name)
            .join(", ") +
          ". existing mail is preserved."
        }
      >
        <div className="wm-modal-actions">
          <Button onClick={() => setPauseWarning(null)}>cancel</Button>
          <Button
            danger
            onClick={() => {
              void request("aliases/" + pauseWarning!.id, "PATCH", {
                enabled: false,
              })
                .then(refresh)
                .then(() => setPauseWarning(null))
                .catch((e) => toast.error(e.message));
            }}
          >
            pause shared alias
          </Button>
        </div>
      </Modal>
      <Modal
        open={!!edit}
        onClose={closeEditor}
        title={
          (edit === "new" ? "add " : "edit ") +
          (collection === "identities"
            ? "identity"
            : collection === "saved-searches"
              ? "search"
              : collection.replace(/s$/, ""))
        }
        wide={collection === "rules"}
      >
        {edit && (
          <ResourceForm
            key={edit === "new" ? "new" : edit.id}
            collection={collection}
            value={edit === "new" ? undefined : edit}
            done={() => {
              dirty.current = false;
              setEdit(null);
            }}
            cancel={closeEditor}
            onDirty={(value) => {
              dirty.current = value;
            }}
          />
        )}
      </Modal>
      <Modal
        open={discard}
        onClose={() => setDiscard(false)}
        title="leave these changes?"
        description="your unsaved changes will be discarded."
      >
        <div className="wm-modal-actions">
          <Button onClick={() => setDiscard(false)}>keep editing</Button>
          <Button
            danger
            onClick={() => {
              dirty.current = false;
              setDiscard(false);
              setEdit(null);
            }}
          >
            discard changes
          </Button>
        </div>
      </Modal>
      <Modal
        open={!!previewRule}
        onClose={() => setPreviewRule(null)}
        title="apply this rule?"
        description={
          previewRule?.count +
          " existing messages match. actions will be applied to each matching message."
        }
      >
        <div className="wm-form">
          {previewRule?.subjects.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
          <div className="wm-modal-actions">
            <Button onClick={() => setPreviewRule(null)}>cancel</Button>
            <Button
              primary
              onClick={() => {
                if (previewRule)
                  void request("rules/" + previewRule.id + "/apply", "POST", {
                    apply: true,
                    count: previewRule.count,
                  })
                    .then(refresh)
                    .then(() => {
                      setPreviewRule(null);
                      toast.success("rule applied");
                    })
                    .catch((e) => toast.error(e.message));
              }}
            >
              apply to matching mail
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
function SortableRow({
  id,
  index,
  disabled,
  children,
}: {
  id: string;
  index: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled });
  return (
    <div ref={ref} className={"wm-resource-row " + (isDragging ? "dragging" : "")}>
      <button
        type="button"
        ref={handleRef}
        className="wm-drag-handle"
        aria-label="drag to reorder"
        disabled={disabled}
      >
        <DotsSixVerticalIcon size={17} />
      </button>
      {children}
    </div>
  );
}
function ContactCSV() {
  const { data, request, refresh } = useMail(),
    input = useRef<HTMLInputElement>(null),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [mapping, setMapping] = useState({
      name: "name",
      email: "email",
      notes: "notes",
    }),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const headers = Object.keys(rows[0] || {}),
    valid = rows.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r[mapping.email] || ""));
  const exportCSV = () => {
    const csv = Papa.unparse(
      data.resources.contacts.flatMap((c) =>
        c.emails.map((email) => ({
          name: c.name,
          email,
          notes: c.notes,
          favorite: c.favorite,
        })),
      ),
      { escapeFormulae: true },
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vael-contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <Button onClick={() => input.current?.click()}>import csv</Button>
      <Button onClick={exportCSV}>export csv</Button>
      <input
        hidden
        type="file"
        accept=".csv,text/csv"
        ref={input}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 2e6) {
            toast.error("choose a csv under 2 mb");
            return;
          }
          Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (result) => {
              if (result.data.length > 1000) {
                toast.info("CSV exceeds 1,000 contacts; importing the first 1,000 rows");
              }
              setRows(result.data.slice(0, 1000));
              const keys = result.meta.fields || [];
              setMapping({
                name: keys.find((k) => /name/i.test(k)) || keys[0] || "",
                email: keys.find((k) => /email/i.test(k)) || keys[1] || keys[0] || "",
                notes: keys.find((k) => /notes/i.test(k)) || "",
              });
              setOpen(true);
            },
          });
        }}
      />
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="import your people"
        description="map columns, then preview. invalid addresses and existing contacts are skipped."
        wide
      >
        <div className="wm-form">
          <div className="wm-csv-mapping">
            {(["name", "email", "notes"] as const).map((field) => (
              <label key={field}>
                {field}
                <VaelSelect
                  value={mapping[field]}
                  onChange={(e) => setMapping((s) => ({ ...s, [field]: e.target.value }))}
                >
                  <option value="">none</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </VaelSelect>
              </label>
            ))}
          </div>
          <p className="wm-muted">
            {rows.length} rows · {valid.length} valid email addresses
          </p>
          <div className="wm-csv-preview">
            {rows.slice(0, 5).map((r, i) => (
              <div key={i}>
                <span>{r[mapping.name]}</span>
                <span>{r[mapping.email]}</span>
              </div>
            ))}
          </div>
          <Button
            primary
            busy={busy}
            disabled={!valid.length}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await request<{
                  imported: number;
                  skipped: number;
                }>("contacts/import", "POST", {
                  contacts: valid.map((r) => ({
                    name: r[mapping.name] || "",
                    emails: [r[mapping.email]],
                    notes: r[mapping.notes] || "",
                    favorite: false,
                    order: 0,
                  })),
                });
                await refresh();
                toast.success(result.imported + " imported · " + result.skipped + " skipped");
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            import contacts
          </Button>
        </div>
      </Modal>
    </>
  );
}
