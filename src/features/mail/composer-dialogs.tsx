import { toast } from "sonner";
import type { SendPreparation } from "@/lib/mail/types";
import { Button, Modal } from "@/ui/controls";

type Choices = Record<string, "original" | "remove">;

export function AttachmentReminderModal({
  open,
  onReturn,
  onSendAnyway,
}: {
  open: boolean;
  onReturn: () => void;
  onSendAnyway: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onReturn}
      title="did you mean to attach a file?"
      description="your message mentions an attachment, but no files are attached."
    >
      <div className="wm-modal-actions">
        <Button onClick={onReturn}>return to message</Button>
        <Button primary onClick={onSendAnyway}>
          send anyway
        </Button>
      </div>
    </Modal>
  );
}

export function UpgradeModal({
  open,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="sending requires vael plus"
      description="free accounts can receive unlimited email. upgrading to plus unlocks sending, 1 gb storage, custom domains, and unlimited aliases."
    >
      <div className="wm-modal-actions">
        <Button onClick={onClose}>keep draft</Button>
        <Button primary onClick={onUpgrade}>
          get plus (€5 / mo) ↗
        </Button>
      </div>
    </Modal>
  );
}

export function PreparationModal({
  prompt,
  choices,
  setChoices,
  onCancel,
  onContinue,
}: {
  prompt: SendPreparation | null;
  choices: Choices;
  setChoices: (update: (old: Choices) => Choices) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <Modal
      open={!!prompt}
      onClose={onCancel}
      title="some files need your choice"
      description="these files could not be safely cleaned. choose what to do with each original before sending."
    >
      {prompt?.files
        .filter((f) => f.status === "original-required")
        .map((f) => (
          <fieldset key={f.id} className="wm-metadata-choice">
            <legend>{f.name}</legend>
            <p className="wm-muted">{f.reason}</p>
            <label>
              <input
                type="radio"
                name={f.id}
                checked={choices[f.id] === "remove"}
                onChange={() => setChoices((old) => ({ ...old, [f.id]: "remove" }))}
              />
              remove attachment
            </label>
            <label>
              <input
                type="radio"
                name={f.id}
                checked={choices[f.id] === "original"}
                onChange={() => setChoices((old) => ({ ...old, [f.id]: "original" }))}
              />
              send original this time · metadata may remain
            </label>
          </fieldset>
        ))}
      <div className="wm-modal-actions">
        <Button onClick={onCancel}>return to message</Button>
        <Button
          primary
          disabled={prompt?.files.some((f) => f.status === "original-required" && !choices[f.id])}
          onClick={onContinue}
        >
          continue
        </Button>
      </div>
    </Modal>
  );
}

export function ScheduleModal({
  open,
  onClose,
  sendAt,
  setSendAt,
  sending,
  production,
  onSchedule,
}: {
  open: boolean;
  onClose: () => void;
  sendAt: string;
  setSendAt: (value: string) => void;
  sending: boolean;
  production: boolean;
  onSchedule: () => void;
}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="send at the right time"
      description={"choose a future time. your device time zone is used (" + zone + ")."}
    >
      <div className="wm-form">
        <label>
          send time (device time zone: {zone})
          <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
        </label>
        <p className="wm-muted">
          {production
            ? "scheduled mail is sent by vael at the selected time. plus sending must remain active."
            : "scheduled mail is delivered inside the demo on your next visit."}
        </p>
        <Button primary busy={sending} disabled={!sendAt} onClick={onSchedule}>
          schedule message
        </Button>
      </div>
    </Modal>
  );
}

export function LinkModal({
  open,
  onClose,
  url,
  setUrl,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  setUrl: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="add a link">
      <form
        className="wm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^(https?:\/\/|mailto:)/i.test(url)) {
            toast.error("use an https, http, or mailto link");
            return;
          }
          onSubmit();
        }}
      >
        <label>
          link address
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        </label>
        <Button primary type="submit">
          add link
        </Button>
      </form>
    </Modal>
  );
}

export function RecoveredDraftModal({
  open,
  onUseServer,
  onRestore,
}: {
  open: boolean;
  onUseServer: () => void;
  onRestore: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="a draft was recovered"
      description="local changes were saved before the connection ended."
    >
      <div className="wm-modal-actions">
        <Button onClick={onUseServer}>use server version</Button>
        <Button primary onClick={onRestore}>
          restore local changes
        </Button>
      </div>
    </Modal>
  );
}

export function ConflictModal({
  open,
  onLoadSaved,
  onSaveCopy,
}: {
  open: boolean;
  onLoadSaved: () => void;
  onSaveCopy: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="this draft changed elsewhere"
      description="choose the saved version or keep your changes as a separate draft."
    >
      <div className="wm-modal-actions">
        <Button onClick={onLoadSaved}>load saved version</Button>
        <Button primary onClick={onSaveCopy}>
          save my changes as a copy
        </Button>
      </div>
    </Modal>
  );
}
