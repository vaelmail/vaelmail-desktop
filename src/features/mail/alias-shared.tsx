import { VaelSelect } from "@/ui/select";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { Collection, Resource, Rule, RuleCondition, RuleAction } from "@/lib/mail/types";
import { formatSingleSieveRule } from "@/lib/mail/sieve-formatter";
import { aliasDomains, aliasSendingNote, defaultAliasDomain } from "@/lib/mail-domains";
import { useMail } from "@/features/mailbox/context";
import { Button, IconButton } from "@/ui/controls";
type Fields = {
  name: string;
  emails: string;
  notes: string;
  favorite: boolean;
  address: string;
  description: string;
  generated: boolean;
  enabled: boolean;
  email: string;
  signature: string;
  domainId: string;
  domain: string;
  color: string;
  query: string;
  match: "all" | "any";
};
type RuleRow<T> = T & {
  rowKey: string;
};
const ruleRow = <T,>(value: T): RuleRow<T> => ({ ...value, rowKey: crypto.randomUUID() });
const conditionValues = (rows: RuleCondition[]): RuleCondition[] =>
  rows.map(({ field, value }) => ({ field, value }));
const actionValues = (rows: RuleAction[]): RuleAction[] =>
  rows.map(({ type, value }) => ({ type, value }));
export function ResourceForm({
  collection,
  value,
  done,
  cancel,
  onDirty,
}: {
  collection: Collection;
  value?: Resource;
  done: () => void;
  cancel: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const { data, request, refresh } = useMail(),
    record = value as unknown as Partial<Fields> & {
      emails?: string[];
    };
  const {
    register,
    setValue,
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
  } = useForm<Fields>({
    defaultValues: {
      name: "",
      notes: "",
      favorite: false,
      address: "",
      description: "",
      generated: false,
      enabled: true,
      email: "",
      signature: "",
      color: "brass",
      query: "",
      match: "all",
      ...record,
      emails: record?.emails?.join(", ") || "",
      domainId: record?.domainId || "",
      domain: defaultAliasDomain,
    },
  });
  const generated = useWatch({ control, name: "generated" });
  const selectValues = useWatch({ control });
  const existing = value as Rule | undefined;
  const [conditions, setConditions] = useState<RuleRow<RuleCondition>[]>(() =>
      ((collection === "rules" && existing?.conditions) || [{ field: "from", value: "" }]).map(
        ruleRow,
      ),
    ),
    [actions, setActions] = useState<RuleRow<RuleAction>[]>(() =>
      ((collection === "rules" && existing?.actions) || [{ type: "read", value: "" }]).map(ruleRow),
    ),
    [error, setError] = useState(""),
    [ruleTab, setRuleTab] = useState<"visual" | "sieve">("visual"),
    [testResult, setTestResult] = useState<{
      count: number;
      subjects: string[];
    } | null>(null),
    [testingRule, setTestingRule] = useState(false),
    [copiedSieve, setCopiedSieve] = useState(false);
  const sieveCode =
    collection === "rules"
      ? formatSingleSieveRule(
          {
            name: selectValues.name,
            enabled: selectValues.enabled,
            match: selectValues.match,
            conditions,
            actions,
          },
          data.resources.folders,
          data.resources.labels,
        )
      : "";
  const testRule = async () => {
    if (!value?.id) {
      toast.info("Save rule first to test against server mailbox, or inspect Sieve Script tab.");
      return;
    }
    setTestingRule(true);
    setTestResult(null);
    try {
      const result = await request<{
        count: number;
        subjects: string[];
      }>(`rules/${value.id}/apply`, "POST", { apply: false });
      setTestResult(result);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingRule(false);
    }
  };
  useEffect(() => {
    onDirty(
      isDirty ||
        (collection === "rules" &&
          (JSON.stringify(conditionValues(conditions)) !==
            JSON.stringify(
              conditionValues(existing?.conditions || [{ field: "from", value: "" }]),
            ) ||
            JSON.stringify(actionValues(actions)) !==
              JSON.stringify(actionValues(existing?.actions || [{ type: "read", value: "" }])))),
    );
  }, [isDirty, conditions, actions, existing, collection, onDirty]);
  const submit = handleSubmit(async (f) => {
    setError("");
    let payload: object = {};
    if (collection === "contacts")
      payload = {
        name: f.name,
        emails: f.emails
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        notes: f.notes,
        favorite: f.favorite,
      };
    if (collection === "aliases")
      payload = {
        address: f.address.includes("@") ? f.address : f.address + "@" + f.domain,
        ...(!value && (f.generated || !f.address.includes("@")) ? { domain: f.domain } : {}),
        description: f.description,
        generated: f.generated,
        enabled: f.enabled,
      };
    if (collection === "domains") payload = { name: f.name };
    if (collection === "identities")
      payload = {
        name: f.name,
        email: f.email,
        signature: f.signature,
        domainId: f.domainId || null,
      };
    if (collection === "folders") payload = { name: f.name };
    if (collection === "labels") payload = { name: f.name, color: f.color };
    if (collection === "rules")
      payload = {
        name: f.name,
        enabled: f.enabled,
        match: f.match,
        conditions: conditionValues(conditions),
        actions: actionValues(actions),
      };
    if (collection === "saved-searches") payload = { name: f.name, query: f.query };
    try {
      await request(collection + (value ? "/" + value.id : ""), value ? "PATCH" : "POST", {
        ...payload,
        order: value?.order ?? data.resources[collection].length,
      });
      await refresh();
      done();
      toast.success("saved");
    } catch (e) {
      setError((e as Error).message);
    }
  });
  return (
    <form className="wm-form" onSubmit={submit}>
      {!["aliases"].includes(collection) && (
        <label>
          {collection === "domains" ? "domain name" : "name"}
          <input
            {...register("name")}
            required={collection !== "contacts" && collection !== "identities"}
            maxLength={200}
            readOnly={collection === "domains" && !!value}
            placeholder={collection === "domains" ? "example.com" : undefined}
          />
        </label>
      )}
      {collection === "contacts" && (
        <>
          <label>
            email addresses
            <input
              {...register("emails")}
              required
              placeholder="mara@example.com, another@example.com"
            />
          </label>
          <label>
            notes
            <textarea {...register("notes")} rows={3} />
          </label>
          <label className="wm-check-label">
            <input type="checkbox" {...register("favorite")} />
            favorite contact
          </label>
        </>
      )}
      {collection === "aliases" && (
        <>
          <label className="wm-check-label">
            <input type="checkbox" {...register("generated")} disabled={!!value} />
            generate a random alias
          </label>
          {value ? (
            !generated && (
              <label>
                custom address
                <input {...register("address")} required disabled />
              </label>
            )
          ) : generated ? (
            <label>
              domain
              <VaelSelect
                value={selectValues.domain}
                onValueChange={(next) => setValue("domain", next, { shouldDirty: true })}
              >
                {aliasDomains.map((d) => (
                  <option key={d} value={d}>
                    @{d}
                  </option>
                ))}
              </VaelSelect>
            </label>
          ) : (
            <div className="wm-alias-field">
              <label htmlFor="wm-alias-name">custom address</label>
              <div className="wm-alias-address">
                <input
                  id="wm-alias-name"
                  {...register("address")}
                  required
                  maxLength={32}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="your-handle"
                />
                <VaelSelect
                  aria-label="alias domain"
                  value={selectValues.domain}
                  onValueChange={(next) => setValue("domain", next, { shouldDirty: true })}
                >
                  {aliasDomains.map((d) => (
                    <option key={d} value={d}>
                      @{d}
                    </option>
                  ))}
                </VaelSelect>
              </div>
            </div>
          )}
          <label>
            description
            <input {...register("description")} placeholder="what will you use this for?" />
          </label>
          <label className="wm-check-label">
            <input type="checkbox" {...register("enabled")} />
            receive mail at this alias
          </label>
          <p className="wm-muted">{aliasSendingNote}</p>
          {value && data.resources.services.some((s) => s.aliasIds.includes(value.id)) && (
            <p className="wm-muted" role="note">
              pausing this alias affects every associated service:{" "}
              {data.resources.services
                .filter((s) => s.aliasIds.includes(value.id))
                .map((s) => s.name)
                .join(", ")}
              . existing mail is preserved.
            </p>
          )}
        </>
      )}
      {collection === "identities" && (
        <>
          <label>
            email address
            <input
              {...register("email")}
              required
              type="email"
              readOnly={true}
              disabled={true}
              value={record?.email || data.mailbox.address}
            />
          </label>
          {
            <p className="wm-form-hint">
              Mail is sent from the address you pick under from: your primary address or a sending
              alias. The name and signature apply to every sending address. {aliasSendingNote}{" "}
              Custom domains are receive-only.
            </p>
          }
          <label>
            signature (simple html)
            <textarea {...register("signature")} rows={4} placeholder="<p>river</p>" />
          </label>
        </>
      )}
      {collection === "labels" && (
        <label>
          color
          <VaelSelect
            value={selectValues.color}
            onValueChange={(value) =>
              setValue("color", value as Fields["color"], { shouldDirty: true })
            }
          >
            {["brass", "sage", "rose", "blue", "stone"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </VaelSelect>
        </label>
      )}
      {collection === "saved-searches" && (
        <label>
          search query
          <input {...register("query")} required placeholder="from:mara is:unread" />
        </label>
      )}
      {collection === "domains" && value && "token" in value && (
        <div className="wm-dns-record">
          <p>simulated TXT record</p>
          <code>{value.token}</code>
          <p>verification only changes this demo&#39;s state.</p>
        </div>
      )}
      {collection === "rules" && (
        <>
          <div className="wm-sieve-tabs">
            <button
              type="button"
              className={`wm-sieve-tab ${ruleTab === "visual" ? "is-active" : ""}`}
              onClick={() => setRuleTab("visual")}
            >
              Visual Builder
            </button>
            <button
              type="button"
              className={`wm-sieve-tab ${ruleTab === "sieve" ? "is-active" : ""}`}
              onClick={() => setRuleTab("sieve")}
            >
              Sieve Script (RFC 5228)
            </button>
          </div>

          {ruleTab === "sieve" ? (
            <div className="wm-sieve-panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <span className="wm-muted" style={{ fontSize: "11px" }}>
                  Compiled Dovecot Sieve bytecode
                </span>
                <button
                  type="button"
                  className="wm-sieve-starter-btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(sieveCode);
                    setCopiedSieve(true);
                    setTimeout(() => setCopiedSieve(false), 2000);
                  }}
                >
                  {copiedSieve ? "✓ Copied" : "Copy Sieve Code"}
                </button>
              </div>
              <pre className="wm-sieve-code-panel">{sieveCode}</pre>
              <p className="wm-muted" style={{ fontSize: "11px", marginTop: "6px" }}>
                This script is compiled to RFC 5228 Sieve bytecode and executed directly by Dovecot
                Pigeonhole upon message delivery.
              </p>
            </div>
          ) : (
            <>
              <div className="wm-sieve-starters">
                <span className="wm-muted" style={{ fontSize: "11px", alignSelf: "center" }}>
                  Quick Starters:
                </span>
                <button
                  type="button"
                  className="wm-sieve-starter-btn"
                  onClick={() => {
                    setConditions([ruleRow({ field: "to", value: "+alias" })]);
                    if (data.resources.folders.length > 0) {
                      setActions([
                        ruleRow({ type: "move", value: data.resources.folders[0]?.id ?? "" }),
                      ]);
                    }
                  }}
                >
                  + Subaddress Alias
                </button>
                <button
                  type="button"
                  className="wm-sieve-starter-btn"
                  onClick={() => {
                    setConditions([ruleRow({ field: "subject", value: "newsletter" })]);
                    setActions([
                      ruleRow({ type: "archive", value: "" }),
                      ruleRow({ type: "read", value: "" }),
                    ]);
                  }}
                >
                  + Newsletters
                </button>
                <button
                  type="button"
                  className="wm-sieve-starter-btn"
                  onClick={() => {
                    setConditions([ruleRow({ field: "attachment", value: "yes" })]);
                    setActions([ruleRow({ type: "star", value: "" })]);
                  }}
                >
                  + Has Attachment
                </button>
              </div>

              <label className="wm-check-label">
                <input type="checkbox" {...register("enabled")} />
                enable this rule
              </label>
              <label>
                when
                <VaelSelect
                  value={selectValues.match}
                  onValueChange={(val) =>
                    setValue("match", val as Fields["match"], {
                      shouldDirty: true,
                    })
                  }
                >
                  <option value="all">all conditions match (AND)</option>
                  <option value="any">any condition matches (OR)</option>
                </VaelSelect>
              </label>
              <div className="wm-rule-group">
                {conditions.map((c, i) => (
                  <div className="wm-rule-line" key={c.rowKey}>
                    <VaelSelect
                      aria-label={"condition field " + (i + 1)}
                      value={c.field}
                      onChange={(e) =>
                        setConditions((s) =>
                          s.map((x, j) =>
                            i === j
                              ? {
                                  ...x,
                                  field: e.target.value as RuleCondition["field"],
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      {["from", "to", "subject", "attachment"].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </VaelSelect>
                    <input
                      aria-label={"condition value " + (i + 1)}
                      required
                      value={c.value}
                      placeholder={c.field === "attachment" ? "yes or no" : "contains…"}
                      onChange={(e) =>
                        setConditions((s) =>
                          s.map((x, j) => (i === j ? { ...x, value: e.target.value } : x)),
                        )
                      }
                    />
                    <IconButton
                      label="remove condition"
                      disabled={conditions.length === 1}
                      onClick={() => setConditions((s) => s.filter((_, j) => j !== i))}
                    >
                      <span>×</span>
                    </IconButton>
                  </div>
                ))}
                <Button
                  disabled={conditions.length >= 10}
                  onClick={() => {
                    const row = ruleRow<RuleCondition>({ field: "subject", value: "" });
                    setConditions((s) => [...s, row]);
                  }}
                >
                  add condition
                </Button>
              </div>
              <p className="wm-muted">then perform these actions</p>
              <div className="wm-rule-group">
                {actions.map((a, i) => (
                  <div className="wm-rule-line" key={a.rowKey}>
                    <VaelSelect
                      aria-label={"action type " + (i + 1)}
                      value={a.type}
                      onChange={(e) =>
                        setActions((s) =>
                          s.map((x, j) =>
                            i === j
                              ? {
                                  ...x,
                                  type: e.target.value as RuleAction["type"],
                                  value: "",
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      {["read", "star", "label", "move", "archive", "spam"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </VaelSelect>
                    {["label", "move"].includes(a.type) && (
                      <VaelSelect
                        required
                        aria-label={"action target " + (i + 1)}
                        value={a.value}
                        onChange={(e) =>
                          setActions((s) =>
                            s.map((x, j) => (i === j ? { ...x, value: e.target.value } : x)),
                          )
                        }
                      >
                        <option value="">choose {a.type === "label" ? "label" : "folder"}</option>
                        {data.resources[a.type === "label" ? "labels" : "folders"].map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </VaelSelect>
                    )}
                    {["move", "archive", "spam"].includes(a.type) && (
                      <span
                        className="wm-sieve-terminal-pill"
                        title="Stops downstream rules from running on matching mail"
                      >
                        🛑 Terminal
                      </span>
                    )}
                    <IconButton
                      label="remove action"
                      disabled={actions.length === 1}
                      onClick={() => setActions((s) => s.filter((_, j) => j !== i))}
                    >
                      <span>×</span>
                    </IconButton>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Button
                    disabled={actions.length >= 10}
                    onClick={() => {
                      const row = ruleRow<RuleAction>({ type: "star", value: "" });
                      setActions((s) => [...s, row]);
                    }}
                  >
                    add action
                  </Button>
                  <Button type="button" disabled={testingRule} onClick={() => void testRule()}>
                    {testingRule ? "testing…" : "test rule on mailbox"}
                  </Button>
                </div>
              </div>

              {testResult && (
                <div className="wm-sieve-test-result">
                  <strong>
                    {testResult.count === 0
                      ? "No matching messages found in mailbox."
                      : `Matches ${testResult.count} message${testResult.count === 1 ? "" : "s"} in your mailbox:`}
                  </strong>
                  {testResult.subjects.length > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: "18px", fontSize: "11px" }}>
                      {testResult.subjects.map((subj, idx) => (
                        <li key={idx} className="wm-muted">
                          {subj}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="wm-field-error">
          {error}
        </p>
      )}
      <div className="wm-modal-actions">
        <Button onClick={cancel}>cancel</Button>
        <Button primary type="submit" busy={isSubmitting}>
          save
        </Button>
      </div>
    </form>
  );
}
