import { ComposeFrom } from "./compose-from";
import { draftContentKey } from "@/lib/mail/draft-content";
import { useEffect, useMemo, useRef, useState } from "react";
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query";
import {} from "@base-ui/react/autocomplete";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { toast } from "sonner";
import { ClockIcon, PaperclipIcon, PaperPlaneTiltIcon, TrashIcon } from "@phosphor-icons/react";
import {
  api,
  ApiError,
  recovery,
  recoveryKey,
  startUpload,
  storeRecovery,
} from "@/lib/mail/client";
import { type Attachment, type Draft, type Job, type SendPreparation } from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import { offline, queueSend } from "@/features/mailbox/outbox";
import { useWorkspace } from "./workspace";
import { Button, Confirm, Dropdown, Failure, IconButton } from "@/ui/controls";
import { openHref, useDesktop } from "@/shell/store";
import { useWindowCloseGuard } from "@/shell/close-guard";
import { registerDraftSaver, saveOpenDrafts } from "@/lib/workspace-navigation";
import { ComposeTypography } from "./typography-extension";
import { promisesAttachment } from "@/lib/mail/plugins";
import { RecipientField } from "./recipient-field";
import { ComposeAttachments, FormattingToolbar, type PendingUpload } from "./composer-parts";
import { ComposerPgpToggle, usePgpCompose } from "./composer-pgp";
import { attachmentBytes, encryptedDraftField } from "@/lib/encryption/api";
import { htmlToPlainText } from "@/lib/encryption/pgp-mime";
import {
  AttachmentReminderModal,
  ConflictModal,
  LinkModal,
  PreparationModal,
  RecoveredDraftModal,
  ScheduleModal,
  UpgradeModal,
} from "./composer-dialogs";
export default function ComposeWindow({ id }: { id: string }) {
  const { data } = useMail();
  const query = useQuery({
    queryKey: ["draft", data.mailbox.id, data.mailbox.generation, id],
    queryFn: () => api<Draft>("drafts/" + id),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (query.error) {
    return (
      <div className="wm v98-compose-state">
        <Failure error={query.error} retry={() => void query.refetch()} />
        <Button onClick={() => useWorkspace.getState().closeDraft(id)}>close</Button>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="wm v98-compose-state">
        <p role="status">Opening draft…</p>
      </div>
    );
  }
  return <Composer initial={query.data} />;
}
function Composer({ initial }: { initial: Draft }) {
  const client = useQueryClient();
  const dispatch = useDesktop((state) => state.dispatch);
  const [baseline] = useState(initial);
  const { data, request, refresh } = useMail();
  const [attachmentPrompt, setAttachmentPrompt] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState(false);
  const attachmentDecision = useRef<((value: boolean) => void) | null>(null);
  const [preparationPrompt, setPreparationPrompt] = useState<SendPreparation | null>(null);
  const [fileChoices, setFileChoices] = useState<Record<string, "original" | "remove">>({});
  const preparationDecision = useRef<
    ((value: Record<string, "original" | "remove"> | null) => void) | null
  >(null);
  const preparationCache = useRef<SendPreparation | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [value, setValue] = useState(initial),
    [status, setStatus] = useState("saved"),
    [error, setError] = useState<ApiError | Error | null>(null),
    [conflict, setConflict] = useState<Draft | null>(null),
    [local, setLocal] = useState<Draft | null>(null);
  const [cc, setCc] = useState(!!initial.cc.length),
    [bcc, setBcc] = useState(!!initial.bcc.length),
    [invalid, setInvalid] = useState({ to: false, cc: false, bcc: false });
  const [schedule, setSchedule] = useState(false),
    [sendAt, setSendAt] = useState(""),
    [link, setLink] = useState(false),
    [linkUrl, setLinkUrl] = useState("");
  const [uploads, setUploads] = useState<PendingUpload[]>([]),
    [sending, setSending] = useState(false);
  const recipientEmails = useMemo(
    () => [...value.to, ...value.cc, ...value.bcc].map((r) => r.email),
    [value.to, value.cc, value.bcc],
  );
  const pgp = usePgpCompose(recipientEmails, true);
  const localRecovery = data.mailbox.settings.localRecovery && pgp.encrypted === false;
  const pgpStored = useRef(
    !!(
      initial as Draft & {
        pgp?: unknown;
      }
    ).pgp,
  );
  const attention =
    status === "save failed" || !!conflict || uploads.some((upload) => upload.state === "failed");
  useEffect(() => {
    dispatch({ type: "attention", id: "compose:" + initial.id, attention });
  }, [dispatch, initial.id, attention]);
  const current = useRef(value),
    version = useRef(initial.revision),
    pending = useRef<Promise<Draft> | null>(null),
    alive = useRef(true),
    lastSaved = useRef(JSON.stringify(initial));
  useEffect(() => {
    useWorkspace.getState().nameDraft(initial.id, value.subject);
  }, [initial.id, value.subject]);
  const key = recoveryKey(data.mailbox.id, data.mailbox.generation, initial.id),
    fileInput = useRef<HTMLInputElement>(null),
    sendKey = useRef<string>("");
  const update = (patch: Partial<Draft>) => {
    if (patch.plain === true) patch = { ...patch, trackOpens: false };
    const next = { ...current.current, ...patch, revision: version.current };
    current.current = next;
    setValue(next);
    if (localRecovery)
      void storeRecovery(key, data.mailbox.id, data.mailbox.generation, next).catch(() => {});
    setStatus("unsaved");
    setError(null);
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ComposeTypography,
      StarterKit.configure({
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
      Placeholder.configure({
        placeholder: "a thought, a note, a little hello…",
      }),
    ],
    content: initial.editor || initial.html,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "message body",
        class: "wm-editor",
      },
    },
    onUpdate: ({ editor }) => update({ html: editor.getHTML(), editor: editor.getJSON() }),
  });
  const formatting = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") || false,
      italic: editor?.isActive("italic") || false,
      list: editor?.isActive("bulletList") || false,
      link: editor?.isActive("link") || false,
      undo: editor?.can().undo() || false,
      redo: editor?.can().redo() || false,
    }),
  });
  const files = useQuery({
    queryKey: ["draft-files", initial.id],
    queryFn: () => request<Attachment[]>("drafts/" + initial.id + "/files"),
  });
  useEffect(() => {
    alive.current = true;
    if (!localRecovery) {
      if (pgp.encrypted) void recovery.drafts.delete(key).catch(() => {});
      return () => {
        alive.current = false;
      };
    }
    void recovery.drafts
      .get(key)
      .then((cached) => {
        if (
          cached &&
          cached.savedAt > Date.parse(baseline.updatedAt) &&
          draftContentKey(cached.draft) !== draftContentKey(baseline)
        )
          setLocal(cached.draft);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [key, baseline, localRecovery, pgp.encrypted]);
  const plainDraftBody = (body: Omit<Draft, "id" | "updatedAt">) => {
    const out: Record<string, unknown> = { ...body };
    delete out.pgp;
    out.pgp = null;
    return out;
  };
  const save = async (): Promise<Draft> => {
    if (pending.current) {
      await pending.current;
      if (JSON.stringify(current.current) === lastSaved.current) return current.current;
    }
    const snapshot = { ...current.current, revision: version.current },
      { id, updatedAt, ...body } = snapshot;
    void updatedAt;
    if (JSON.stringify(snapshot) === lastSaved.current) return snapshot;
    if (conflict) throw new Error("resolve the draft conflict first");
    setStatus("saving");
    pending.current = (async () => {
      if (localRecovery)
        await recovery.drafts
          .put({
            key,
            mailboxId: data.mailbox.id,
            generation: data.mailbox.generation,
            draft: snapshot,
            savedAt: Date.now(),
          })
          .catch(() => {});
      try {
        const saved = await request<Draft>("drafts/" + id, "PATCH", plainDraftBody(body));
        pgpStored.current = false;
        client.setQueryData(["draft", data.mailbox.id, data.mailbox.generation, id], saved);
        version.current = saved.revision;
        const unchanged = JSON.stringify(current.current) === JSON.stringify(snapshot);
        const next = unchanged
          ? saved
          : {
              ...current.current,
              revision: saved.revision,
              updatedAt: saved.updatedAt,
            };
        current.current = next;
        lastSaved.current = JSON.stringify(saved);
        if (alive.current) {
          setValue(next);
          setStatus(unchanged ? "saved" : "unsaved");
          setError(null);
        }
        if (unchanged) await recovery.drafts.delete(key);
        return saved;
      } catch (e) {
        if (alive.current) {
          setError(e as Error);
          setStatus("save failed");
          if (e instanceof ApiError && (e.detail.latest || e.detail.code === "draft_conflict")) {
            if (e.detail.latest) {
              setConflict(e.detail.latest);
            } else {
              void request<Draft>(`drafts/${initial.id}`, "GET")
                .then((d) => {
                  if (alive.current) setConflict(d);
                })
                .catch(() => {});
            }
          }
        }
        throw e;
      } finally {
        pending.current = null;
      }
    })();
    return pending.current;
  };
  const saveRef = useRef<() => Promise<Draft>>(async () => initial);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => registerDraftSaver(initial.id, () => saveRef.current()), [initial.id]);
  useWindowCloseGuard(async () => {
    if (sending || preparing) throw new Error("Wait for the current send preparation to finish.");
    if (uploads.length) throw new Error("Finish or cancel your attachment uploads before closing.");
    if (Object.values(invalid).some(Boolean)) {
      throw new Error("Finish or clear your recipient addresses before closing.");
    }
    await saveRef.current();
  });
  useEffect(
    () => () => {
      void refresh();
    },
    [refresh],
  );
  useEffect(() => {
    if (status !== "unsaved" || conflict || local) return;
    const timer = setTimeout(() => void saveRef.current().catch(() => {}), 800);
    return () => clearTimeout(timer);
  }, [value, status, conflict, local]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(current.current) !== lastSaved.current) {
        e.preventDefault();
        if (localRecovery)
          void recovery.drafts.put({
            key,
            mailboxId: data.mailbox.id,
            generation: data.mailbox.generation,
            draft: current.current,
            savedAt: Date.now(),
          });
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [key, data.mailbox.id, data.mailbox.generation, localRecovery]);
  useEffect(() => {
    if (pgp.on || !pgpStored.current || false) return;
    lastSaved.current = "";
    setStatus("unsaved");
  }, [pgp.on, data.mode]);
  const openBilling = () => {
    void saveOpenDrafts()
      .then(() => openHref("/dashboard/billing"))
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "save your draft before continuing"),
      );
  };
  const encryptDraft = async (saved: Draft): Promise<Draft> => {
    const { buildEncryptedMime } = await import("@/lib/encryption/pgp");
    const listed = files.data || [];
    const attachments = await Promise.all(
      saved.attachmentIds.map(async (id) => {
        const meta = listed.find((f) => f.id === id);
        return {
          name: meta?.name || "attachment",
          type: meta?.type || "application/octet-stream",
          bytes: await attachmentBytes(id),
        };
      }),
    );
    const html = saved.plain ? null : saved.html + (saved.quote || "");
    const text = html ? htmlToPlainText(html) : editor?.getText() || htmlToPlainText(saved.html);
    const mime = await buildEncryptedMime({
      recipients: [...saved.to, ...saved.cc, ...saved.bcc].map((r) => r.email),
      subject: saved.subject,
      text,
      html,
      attachments,
    });
    const { id, updatedAt, ...body } = saved;
    void updatedAt;
    const next = await request<Draft>("drafts/" + id, "PATCH", {
      ...body,
      ...encryptedDraftField(mime),
    });
    pgpStored.current = true;
    version.current = next.revision;
    lastSaved.current = JSON.stringify(next);
    current.current = {
      ...current.current,
      revision: next.revision,
      updatedAt: next.updatedAt,
    };
    return next;
  };
  const queueOffline = async () => {
    try {
      await queueSend(data.mailbox.id, data.mailbox.generation, {
        ...current.current,
        revision: version.current,
      });
      await recovery.drafts.delete(key).catch(() => undefined);
      useWorkspace.getState().closeDraft(initial.id);
      toast.message("you're offline. VaelMail sends this as soon as you're back online.");
    } catch {
      toast.error("you're offline and the message couldn't be queued. it stays open here.");
    }
  };
  const send = async (dueAt?: string) => {
    if (sending) return;
    if (uploads.length) {
      toast.error("finish or cancel your attachment uploads first");
      return;
    }
    if (Object.values(invalid).some(Boolean)) {
      toast.error("finish entering your recipients");
      return;
    }
    if (!current.current.to.length && !current.current.cc.length && !current.current.bcc.length) {
      toast.error("add at least one recipient");
      return;
    }
    if (!data.capabilities.send) {
      setUpgradePrompt(true);
      toast.error("sending requires plus. your draft stays open.", {
        action: {
          label: "get plus (€5/mo)",
          onClick: openBilling,
        },
        duration: 10000,
      });
      return;
    }
    if (pgp.on && pgp.missing.length) {
      toast.error(
        "no OpenPGP key for " +
          pgp.missing.join(", ") +
          ". turn off encryption or remove these recipients.",
      );
      return;
    }
    if (pgp.on && current.current.trackOpens) update({ trackOpens: false });
    if (!dueAt && !pgp.on && !onlineManager.isOnline()) {
      await queueOffline();
      return;
    }
    setSending(true);
    try {
      let saved = await save();
      if (
        data.mailbox.settings.attachmentReminder &&
        !saved.attachmentIds.length &&
        promisesAttachment(
          saved.subject,
          saved.html,
          saved.plain,
          data.resources.identities.find((i) => i.id === saved.identityId)?.signature,
        )
      ) {
        const proceed = await new Promise<boolean>((resolve) => {
          attachmentDecision.current = resolve;
          setAttachmentPrompt(true);
        });
        if (!proceed) return;
        if (draftContentKey(saved) !== draftContentKey(current.current))
          throw new Error("your message changed; review it and send again");
      }
      let preparation: SendPreparation | undefined;
      let originalApprovals: {
        id: string;
        hash: string;
      }[] = [];
      {
        for (let attempt = 0; attempt < 31; attempt++) {
          setPreparing(true);
          preparation =
            preparationCache.current?.revision === saved.revision
              ? preparationCache.current
              : await request<SendPreparation>("drafts/" + initial.id + "/prepare-send", "POST", {
                  revision: saved.revision,
                });
          preparationCache.current = preparation;
          setPreparing(false);
          const unresolved = preparation.files.filter((f) => f.status === "original-required");
          if (!unresolved.length) break;
          const decisions = await new Promise<Record<string, "original" | "remove"> | null>(
            (resolve) => {
              preparationDecision.current = resolve;
              setFileChoices({});
              setPreparationPrompt(preparation!);
            },
          );
          if (!decisions) {
            preparationCache.current = null;
            return;
          }
          if (draftContentKey(saved) !== draftContentKey(current.current))
            throw new Error("your message changed; review it and send again");
          const remove = unresolved.filter((f) => decisions[f.id] === "remove").map((f) => f.id);
          if (remove.length) {
            update({
              attachmentIds: current.current.attachmentIds.filter((id) => !remove.includes(id)),
            });
            saved = await save();
            preparationCache.current = null;
            continue;
          }
          originalApprovals = unresolved.map((f) => ({
            id: f.id,
            hash: f.hash,
          }));
          break;
        }
      }
      if (draftContentKey(saved) !== draftContentKey(current.current))
        throw new Error("your message changed; review it and send again");
      if (pgp.on) {
        saved = await encryptDraft(saved);
        {
          preparation = await request<SendPreparation>(
            "drafts/" + initial.id + "/prepare-send",
            "POST",
            { revision: saved.revision },
          );
          preparationCache.current = preparation;
        }
      }
      if (!sendKey.current) sendKey.current = crypto.randomUUID();
      const job = await request<Job>("drafts/" + initial.id + "/send", "POST", {
        key: sendKey.current,
        revision: saved.revision,
        ...(preparation ? { preparationId: preparation.id, originalApprovals } : {}),
        ...(dueAt ? { dueAt } : {}),
      });
      await recovery.drafts.delete(key);
      useWorkspace.getState().closeDraft(initial.id);
      const wait = Math.max(0, Date.parse(job.dueAt) - Date.now());
      toast.success(dueAt ? "message scheduled" : "message queued", {
        duration: dueAt ? 5000 : Math.max(5000, wait),
        ...(!dueAt && wait
          ? {
              action: {
                label: "undo send",
                onClick: () => {
                  void request<Draft>("jobs/" + job.id + "/cancel", "POST", {})
                    .then((d) => {
                      useWorkspace.getState().openDraft(d.id);
                      return refresh();
                    })
                    .catch((e) => toast.error(e.message));
                },
              },
            }
          : {}),
      });
    } catch (e) {
      if (offline(e) && !dueAt && !pgp.on) await queueOffline();
      else toast.error((e as Error).message);
    } finally {
      setSending(false);
      setPreparing(false);
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter" &&
        (event.target as HTMLElement).closest<HTMLElement>(".wm-compose")?.dataset.draftId ===
          initial.id
      ) {
        event.preventDefault();
        void send();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });
  const upload = (file: File, retryId?: string) => {
    const id = retryId || crypto.randomUUID();
    const xhr = startUpload(file, initial.id, data.mailbox.generation, {
      progress: (progress) =>
        setUploads((s) => s.map((u) => (u.id === id ? { ...u, progress } : u))),
      done: (value) => {
        const f = value as Attachment;
        update({ attachmentIds: [...current.current.attachmentIds, f.id] });
        setUploads((s) => s.filter((u) => u.id !== id));
        void files.refetch();
      },
      fail: (message) => {
        setUploads((s) => s.map((u) => (u.id === id ? { ...u, state: "failed" } : u)));
        toast.error(message);
      },
      cancel: () => setUploads((s) => s.filter((u) => u.id !== id)),
    });
    setUploads((s) => [
      ...s.filter((u) => u.id !== id),
      { id, name: file.name, progress: 0, state: "uploading", file, xhr },
    ]);
  };
  const applyLocal = (d: Draft) => {
    version.current = initial.revision;
    update({ ...d, revision: version.current });
    editor?.commands.setContent(d.editor || d.html);
    setLocal(null);
  };
  const content = (
    <>
      {
        <>
          <div
            className="wm-compose-scroll"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) {
                e.preventDefault();
                Array.from(e.dataTransfer.files).forEach((f) => upload(f));
              }
            }}
          >
            <div className="wm-compose-from">
              <ComposeFrom
                id={"from-" + initial.id}
                identities={data.resources.identities}
                value={value.identityId}
                onChange={(identityId) => update({ identityId })}
              />
              <Button onClick={() => setCc(!cc)}>cc</Button>
              <Button onClick={() => setBcc(!bcc)}>bcc</Button>
            </div>
            <RecipientField
              name={"to-" + initial.id}
              value={value.to}
              onChange={(to) => update({ to })}
              invalid={invalid.to}
              setInvalid={(to) => setInvalid((s) => ({ ...s, to }))}
            />
            {cc && (
              <RecipientField
                name={"cc-" + initial.id}
                value={value.cc}
                onChange={(cc) => update({ cc })}
                invalid={invalid.cc}
                setInvalid={(cc) => setInvalid((s) => ({ ...s, cc }))}
              />
            )}
            {bcc && (
              <RecipientField
                name={"bcc-" + initial.id}
                value={value.bcc}
                onChange={(bcc) => update({ bcc })}
                invalid={invalid.bcc}
                setInvalid={(bcc) => setInvalid((s) => ({ ...s, bcc }))}
              />
            )}
            <label className="wm-compose-subject">
              <span>subject</span>
              <input
                aria-label="subject"
                value={value.subject}
                onChange={(e) => update({ subject: e.target.value })}
              />
            </label>
            {value.plain ? (
              <textarea
                className="wm-plain-editor"
                aria-label="plain text message"
                placeholder="a thought, a note, a little hello…"
                value={editor?.getText() || ""}
                onChange={(e) => {
                  const html = e.target.value
                    .split("\n")
                    .map(
                      (p) =>
                        "<p>" +
                        p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
                        "</p>",
                    )
                    .join("");
                  editor?.commands.setContent(html);
                  update({ html, editor: editor?.getJSON() || null });
                }}
              />
            ) : (
              <EditorContent editor={editor} />
            )}
            {value.quote && (
              <details className="wm-quote">
                <summary>quoted message included</summary>
                <p className="wm-muted">the original message is included below your reply.</p>
                <Button onClick={() => update({ quote: "" })}>remove quote</Button>
              </details>
            )}
            <ComposeAttachments
              attachments={(files.data || []).filter((f) => value.attachmentIds.includes(f.id))}
              uploads={uploads}
              onRemove={(f) => {
                update({
                  attachmentIds: current.current.attachmentIds.filter((i) => i !== f.id),
                });
                void saveRef
                  .current()
                  .then(() =>
                    f.draftId
                      ? request("attachments/" + f.id, "DELETE").catch((error) => {
                          if (error instanceof ApiError && error.detail.code === "not_found")
                            return;
                          throw error;
                        })
                      : Promise.resolve(),
                  )
                  .then(() => files.refetch())
                  .catch((e) => toast.error(e.message));
              }}
              onRetry={(u) => upload(u.file, u.id)}
              onCancel={(u) => {
                u.xhr?.abort();
                setUploads((s) => s.filter((x) => x.id !== u.id));
              }}
            />
          </div>
          {error && (
            <div className="wm-compose-error" role="alert">
              {error.message}
              <Button onClick={() => void save().catch(() => {})}>retry save</Button>
            </div>
          )}
          <FormattingToolbar
            editor={editor}
            formatting={formatting}
            plain={!!value.plain}
            status={status}
            onLink={() => setLink(true)}
          />
          <div className="wm-compose-plugins">
            {data.mailbox.settings.stripMetadata && (
              <span>
                {preparing ? "cleaning attachment metadata…" : "attachment metadata protection on"}
              </span>
            )}
            {
              <label
                title={
                  value.plain
                    ? "switch to formatted mail to track opens"
                    : "one pixel per message; proxies may trigger Seen"
                }
              >
                <input
                  type="checkbox"
                  checked={!!value.trackOpens && !value.plain && !pgp.on}
                  disabled={value.plain || sending || pgp.on}
                  onChange={(e) => update({ trackOpens: e.target.checked })}
                />
                track opens{value.plain ? " · requires formatted mail" : ""}
              </label>
            }
            <ComposerPgpToggle pgp={pgp} disabled={sending} />
          </div>
          <div className="wm-compose-footer">
            <div className="wm-row">
              <Button
                primary
                busy={sending}
                disabled={uploads.length > 0 || !!conflict || !!local}
                onClick={() => void send()}
              >
                <PaperPlaneTiltIcon size={17} />
                send
              </Button>
              <IconButton
                label="schedule send"
                disabled={sending || uploads.length > 0}
                onClick={() => setSchedule(true)}
              >
                <ClockIcon size={19} />
              </IconButton>
              <IconButton label="attach files" onClick={() => fileInput.current?.click()}>
                <PaperclipIcon size={19} />
              </IconButton>
              <input
                type="file"
                multiple
                hidden
                ref={fileInput}
                onChange={(e) => {
                  Array.from(e.target.files || []).forEach((f) => upload(f));
                  e.target.value = "";
                }}
              />
              <Dropdown
                label="compose options"
                items={[
                  {
                    label: value.plain ? "use rich text" : "use plain text",
                    action: () => {
                      if (!value.plain && editor) {
                        const html = editor
                          .getText()
                          .split("\n")
                          .map(
                            (p) =>
                              "<p>" +
                              p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
                              "</p>",
                          )
                          .join("");
                        editor.commands.setContent(html);
                        update({ plain: true, html, editor: editor.getJSON() });
                      } else update({ plain: false });
                    },
                  },
                  {
                    label: "insert signature",
                    action: () => {
                      const signature = data.resources.identities.find(
                        (i) => i.id === value.identityId,
                      )?.signature;
                      if (signature) editor?.chain().focus().insertContent(signature).run();
                      else toast.info("add a signature in compose settings");
                    },
                  },
                ]}
              >
                <span>···</span>
              </Dropdown>
            </div>
            <Confirm
              title="discard this draft?"
              description="your draft and its unused attachments will be removed."
              trigger={(open) => (
                <IconButton label="discard draft" onClick={open}>
                  <TrashIcon size={18} />
                </IconButton>
              )}
              action={async () => {
                try {
                  if (pending.current) await pending.current;
                  await request("drafts/" + initial.id, "DELETE");
                  await recovery.drafts.delete(key);
                  useWorkspace.getState().closeDraft(initial.id);
                } catch (e) {
                  toast.error((e as Error).message);
                  throw e;
                }
              }}
            />
          </div>
        </>
      }
    </>
  );
  return (
    <>
      <div className="wm-compose v98-compose-body" data-draft-id={initial.id}>
        {content}
      </div>
      <AttachmentReminderModal
        open={attachmentPrompt}
        onReturn={() => {
          setAttachmentPrompt(false);
          attachmentDecision.current?.(false);
        }}
        onSendAnyway={() => {
          setAttachmentPrompt(false);
          attachmentDecision.current?.(true);
        }}
      />
      <UpgradeModal
        open={upgradePrompt}
        onClose={() => setUpgradePrompt(false)}
        onUpgrade={openBilling}
      />
      <PreparationModal
        prompt={preparationPrompt}
        choices={fileChoices}
        setChoices={setFileChoices}
        onCancel={() => {
          setPreparationPrompt(null);
          preparationDecision.current?.(null);
        }}
        onContinue={() => {
          setPreparationPrompt(null);
          preparationDecision.current?.(fileChoices);
        }}
      />
      <ScheduleModal
        open={schedule}
        onClose={() => setSchedule(false)}
        sendAt={sendAt}
        setSendAt={setSendAt}
        sending={sending}
        production={true}
        onSchedule={() => void send(new Date(sendAt).toISOString())}
      />
      <LinkModal
        open={link}
        onClose={() => setLink(false)}
        url={linkUrl}
        setUrl={setLinkUrl}
        onSubmit={() => {
          editor?.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
          setLink(false);
        }}
      />
      <RecoveredDraftModal
        open={!!local}
        onUseServer={() => {
          setLocal(null);
          void recovery.drafts.delete(key);
        }}
        onRestore={() => local && applyLocal(local)}
      />
      <ConflictModal
        open={!!conflict}
        onLoadSaved={() => {
          if (!conflict) return;
          current.current = conflict;
          version.current = conflict.revision;
          lastSaved.current = JSON.stringify(conflict);
          setValue(conflict);
          editor?.commands.setContent(conflict.editor || conflict.html);
          setConflict(null);
          setError(null);
          setStatus("saved");
          void recovery.drafts.delete(key);
        }}
        onSaveCopy={() => {
          const { id, updatedAt, ...body } = current.current;
          void id;
          void updatedAt;
          void request<Draft>("drafts", "POST", body)
            .then((d) => {
              useWorkspace.getState().closeDraft(initial.id);
              useWorkspace.getState().openDraft(d.id);
            })
            .catch((e) => toast.error(e.message));
        }}
      />
    </>
  );
}
