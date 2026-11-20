import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { api, remainingTime } from "@/lib/mail/client";
import { mailDate } from "@/lib/mail/date";
import type {
  ActionResult,
  Alias,
  Service,
  ServicesWorkspace,
  ServiceSuggestion,
} from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import {
  Button,
  Confirm,
  Empty,
  Failure,
  IconButton,
  MailLink,
  Modal,
  Skeleton,
} from "@/ui/controls";
import { SenderIcon } from "./sender-icon";

export function ServicesPanel() {
  const { data, request, refresh } = useMail();
  const q = useQuery({
    queryKey: ["services", data.mailbox.id, data.mailbox.generation],
    queryFn: ({ signal }) =>
      api<ServicesWorkspace>("services/workspace", "GET", undefined, undefined, signal),
  });
  const [edit, setEdit] = useState<Partial<Service> | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<{
    id: string;
    type: "archive" | "trash";
    count: number;
    domains: string[];
  } | null>(null);
  const [pause, setPause] = useState<Alias | null>(null),
    [address, setAddress] = useState("");
  const services = q.data?.services || [],
    current = services.find((s) => s.id === detail);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await refresh();
      await q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("address copied");
    } catch {
      toast.error("could not copy. select the address and copy manually.");
    }
  };
  const suggest = (s: ServiceSuggestion) => {
    setError(null);
    setEdit({
      name: s.name,
      senderDomains: [s.domain],
      aliasIds: s.aliasIds,
      muted: false,
      order: services.length,
    });
  };
  const preview = (s: Service, type: "archive" | "trash") =>
    void run(async () => {
      const p = await request<{ count: number; domains: string[] }>(
        "services/" + s.id + "/cleanup?type=" + type,
      );
      setCleanup({ id: s.id, type, ...p });
    });
  if (q.isPending) return <Skeleton />;
  if (q.error) return <Failure error={q.error} retry={() => void q.refetch()} />;
  return (
    <section className="wm-resource-page wm-services" aria-label="services workspace">
      <div className="wm-page-heading">
        <div>
          <h1>services</h1>
          <p className="wm-muted">your services and the addresses they use.</p>
        </div>
        <Button
          primary
          onClick={() => {
            setError(null);
            setEdit({
              name: "",
              senderDomains: [],
              aliasIds: [],
              muted: false,
              order: services.length,
            });
          }}
        >
          <PlusIcon size={16} />
          add service
        </Button>
      </div>
      {error && (
        <p role="alert" className="wm-error">
          {error}
        </p>
      )}
      {data.filtering?.error ? (
        <p role="alert" className="wm-error">
          could not update incoming mail filters. previously active filters are still in use.{" "}
          <Button disabled={busy} onClick={() => void run(() => request("rules/retry", "POST"))}>
            retry
          </Button>
        </p>
      ) : data.filtering?.pending ? (
        <p role="status" className="wm-muted">
          updating incoming mail filters…
        </p>
      ) : null}
      {services.length ? (
        <div className="wm-service-list">
          {services.map((s) => (
            <button
              type="button"
              className="wm-service-entry"
              key={s.id}
              onClick={() => {
                setDetail(s.id);
                setError(null);
              }}
            >
              <SenderIcon
                sender={{ name: s.name, email: "sender@" + s.senderDomains[0] }}
                serviceId={s.id}
              />
              <span>
                <strong>{s.name}</strong>
                <small>
                  {s.aliasIds.length} associated {s.aliasIds.length === 1 ? "alias" : "aliases"} ·{" "}
                  {s.messageCount} received messages
                </small>
              </span>
              <span className="wm-service-activity">
                {s.muted && <small>muted</small>}
                <time>
                  {s.latestActivity
                    ? mailDate(s.latestActivity, "MMM d, HH:mm", data.mailbox.timezone)
                    : "no activity yet"}
                </time>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="no managed services yet"
          description="confirm a suggestion below or add a service to connect its sender domains and aliases."
        />
      )}
      {q.data.suggestions.length > 0 && (
        <div className="wm-service-suggestions">
          <h2>suggested from your mail</h2>
          <p className="wm-muted">
            review the name and exact sender domains before adding a service.
          </p>
          {q.data.suggestions.map((s) => (
            <div className="wm-service-entry" key={s.domain}>
              <SenderIcon sender={{ name: s.name, email: "sender@" + s.domain }} />
              <span>
                <strong>{s.name}</strong>
                <small>
                  {s.domain} · {s.messageCount} messages
                </small>
              </span>
              <Button onClick={() => suggest(s)}>review</Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() => request("services/dismiss", "POST", { domain: s.domain }))
                }
              >
                dismiss
              </Button>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "edit service" : "confirm service"}
        description="only these exact sender domains are associated. subdomains must be listed separately."
      >
        {edit && (
          <form
            className="wm-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request(
                  "services" + (edit.id ? "/" + edit.id : ""),
                  edit.id ? "PATCH" : "POST",
                  edit,
                );
                setEdit(null);
              });
            }}
          >
            <label>
              service name
              <input
                required
                maxLength={80}
                value={edit.name || ""}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label>
              exact sender domains
              <textarea
                required
                value={edit.senderDomains?.join("\n") || ""}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    senderDomains: e.target.value.split(/\n|,/).map((d) => d.trim()),
                  })
                }
              />
            </label>
            <fieldset>
              <legend>associated aliases</legend>
              {data.resources.aliases.length ? (
                data.resources.aliases.map((a) => (
                  <label key={a.id} className="wm-row">
                    <input
                      type="checkbox"
                      checked={edit.aliasIds?.includes(a.id) || false}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          aliasIds: e.target.checked
                            ? [...(edit.aliasIds || []), a.id]
                            : edit.aliasIds?.filter((id) => id !== a.id),
                        })
                      }
                    />
                    {a.address}
                  </label>
                ))
              ) : (
                <p>create an alias from service details after confirmation.</p>
              )}
            </fieldset>
            {error && (
              <p role="alert" className="wm-error">
                {error}
              </p>
            )}
            <div className="wm-modal-actions">
              <Button onClick={() => setEdit(null)}>cancel</Button>
              <Button primary busy={busy} type="submit">
                {edit.id ? "save service" : "confirm service"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!current}
        onClose={() => setDetail(null)}
        title={current?.name || "service"}
        description={current ? current.senderDomains.join(", ") : undefined}
      >
        {current && (
          <div className="wm-service-detail">
            {error && (
              <p role="alert" className="wm-error">
                {error}
              </p>
            )}
            <div className="wm-row">
              <MailLink
                className="wm-button"
                href={"/webmail/all?service=" + current.id}
                onClick={() => setDetail(null)}
              >
                view service mail
              </MailLink>
              <Button
                onClick={() => {
                  setEdit({
                    id: current.id,
                    name: current.name,
                    senderDomains: current.senderDomains,
                    aliasIds: current.aliasIds,
                    muted: current.muted,
                    order: current.order,
                  });
                  setDetail(null);
                }}
              >
                edit associations
              </Button>
            </div>
            <h3>receiving aliases</h3>
            {current.aliasIds.map((id) => {
              const a = data.resources.aliases.find((a) => a.id === id);
              return (
                a && (
                  <div className="wm-service-alias" key={id}>
                    <span>
                      <strong>{a.address}</strong>
                      <small>{a.enabled ? "receiving" : "paused"}</small>
                    </span>
                    <IconButton label={"copy " + a.address} onClick={() => void copy(a.address)}>
                      <CopyIcon size={17} />
                    </IconButton>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        a.enabled
                          ? setPause(a)
                          : void run(() =>
                              request("aliases/" + a.id, "PATCH", {
                                enabled: true,
                              }),
                            )
                      }
                    >
                      {a.enabled ? "pause alias" : "enable alias"}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          request("services/" + current.id, "PATCH", {
                            aliasIds: current.aliasIds.filter((alias) => alias !== id),
                          }),
                        )
                      }
                    >
                      remove association
                    </Button>
                  </div>
                )
              );
            })}
            {!current.aliasIds.length && (
              <p className="wm-muted">
                no aliases associated. messages can also arrive at {data.mailbox.address}.
              </p>
            )}
            <form
              className="wm-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await request<Alias>("services/" + current.id + "/addresses", "POST", {
                    handle: address.trim().toLowerCase().replace(/@.*$/, ""),
                  });
                  setAddress("");
                  toast.success("service address created");
                });
              }}
            >
              <label>
                new alias handle
                <input
                  value={address}
                  placeholder="leave blank for a random address"
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <Button busy={busy} type="submit">
                create service address
              </Button>
            </form>
            <h3>future mail</h3>
            <p className="wm-muted">
              muting archives future matching mail, marks it read, and suppresses its notifications.
              existing mail stays where it is.
            </p>
            <Button
              busy={busy}
              onClick={() =>
                void run(() =>
                  request("services/" + current.id, "PATCH", {
                    muted: !current.muted,
                  }),
                )
              }
            >
              {current.muted ? "unmute service" : "mute service"}
            </Button>
            <h3>clean up existing mail</h3>
            <div className="wm-row">
              <Button disabled={busy} onClick={() => preview(current, "archive")}>
                archive service mail
              </Button>
              <Button danger disabled={busy} onClick={() => preview(current, "trash")}>
                trash service mail
              </Button>
            </div>
            <Confirm
              title="remove service association?"
              description="its mail and aliases will be preserved. the sender domains may be suggested again."
              trigger={(open) => (
                <Button danger onClick={open}>
                  remove service
                </Button>
              )}
              action={async () => {
                await request("services/" + current.id, "DELETE");
                setDetail(null);
                await refresh();
                await q.refetch();
              }}
            />
          </div>
        )}
      </Modal>
      <Modal
        open={!!pause}
        onClose={() => setPause(null)}
        title="pause receiving alias?"
        description={
          pause
            ? "pausing " +
              pause.address +
              " stops future mail for every service using this address. affected services: " +
              (services
                .filter((s) => s.aliasIds.includes(pause.id))
                .map((s) => s.name)
                .join(", ") || "none") +
              ". existing mail is preserved."
            : undefined
        }
      >
        <div className="wm-modal-actions">
          <Button onClick={() => setPause(null)}>cancel</Button>
          <Button
            busy={busy}
            danger
            onClick={() =>
              void run(async () => {
                await request("aliases/" + pause!.id, "PATCH", {
                  enabled: false,
                });
                setPause(null);
              })
            }
          >
            pause alias
          </Button>
        </div>
        {error && <p role="alert">{error}</p>}
      </Modal>
      <Modal
        open={!!cleanup}
        onClose={() => setCleanup(null)}
        title={cleanup?.type + " matching service mail?"}
        description={
          cleanup
            ? cleanup.count +
              " messages from exact domains " +
              cleanup.domains.join(", ") +
              ". spam and trash are excluded. " +
              (cleanup.type === "archive"
                ? "already archived mail is excluded."
                : "archived mail is included.")
            : undefined
        }
      >
        <div className="wm-modal-actions">
          <Button onClick={() => setCleanup(null)}>cancel</Button>
          <Button
            primary
            busy={busy}
            disabled={!cleanup?.count}
            onClick={() =>
              void run(async () => {
                const result = await request<ActionResult>(
                  "services/" + cleanup!.id + "/cleanup",
                  "POST",
                  {
                    type: cleanup!.type,
                    count: cleanup!.count,
                    domains: cleanup!.domains,
                  },
                );
                setCleanup(null);
                toast.success(
                  result.count + " messages updated",
                  result.undoId
                    ? {
                        duration: remainingTime(result.expiresAt!),
                        action: {
                          label: "undo",
                          onClick: () =>
                            void run(() => request("undo/" + result.undoId, "POST", {})),
                        },
                      }
                    : {},
                );
              })
            }
          >
            confirm cleanup
          </Button>
        </div>
        {error && (
          <p role="alert">
            {error}
            <Button
              onClick={() =>
                cleanup &&
                preview(
                  services.find((s) => s.id === cleanup.id)!,
                  cleanup.type,
                )
              }
            >
              review updated scope
            </Button>
          </p>
        )}
      </Modal>
    </section>
  );
}
