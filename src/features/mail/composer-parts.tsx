import type { Editor } from "@tiptap/react";
import {
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CheckIcon,
  CircleNotchIcon,
  LinkIcon,
  ListBulletsIcon,
  TextBIcon,
  TextItalicIcon,
  XIcon,
} from "@phosphor-icons/react";
import { formatBytes, type Attachment } from "@/lib/mail/types";
import { Button, IconButton } from "@/ui/controls";

export type PendingUpload = {
  id: string;
  name: string;
  progress: number;
  state: string;
  file: File;
  xhr?: { abort: () => void };
};

type Formatting = {
  bold: boolean;
  italic: boolean;
  list: boolean;
  link: boolean;
  undo: boolean;
  redo: boolean;
} | null;

export function ComposeAttachments({
  attachments,
  uploads,
  onRemove,
  onRetry,
  onCancel,
}: {
  attachments: Attachment[];
  uploads: PendingUpload[];
  onRemove: (file: Attachment) => void;
  onRetry: (upload: PendingUpload) => void;
  onCancel: (upload: PendingUpload) => void;
}) {
  return (
    <div className="wm-compose-files">
      {attachments.map((f) => (
        <div key={f.id} className="wm-file">
          <span>
            <strong>{f.name}</strong>
            <small>{formatBytes(f.bytes)}</small>
          </span>
          <IconButton label={"remove " + f.name} onClick={() => onRemove(f)}>
            <XIcon size={16} />
          </IconButton>
        </div>
      ))}
      {uploads.map((u) => (
        <div className="wm-file" key={u.id}>
          <span>
            <strong>{u.name}</strong>
            <small>{u.state === "failed" ? "upload failed" : u.progress + "% uploaded"}</small>
            {u.state === "uploading" && (
              <progress value={u.progress} max={100} aria-label={"uploading " + u.name} />
            )}
          </span>
          {u.state === "failed" && <Button onClick={() => onRetry(u)}>retry</Button>}
          <IconButton label={"cancel upload " + u.name} onClick={() => onCancel(u)}>
            <XIcon size={16} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

export function FormattingToolbar({
  editor,
  formatting,
  plain,
  status,
  onLink,
}: {
  editor: Editor | null;
  formatting: Formatting | undefined;
  plain: boolean;
  status: string;
  onLink: () => void;
}) {
  return (
    <div className="wm-compose-format" role="toolbar" aria-label="message formatting">
      {!plain && (
        <>
          <IconButton
            label="bold"
            aria-pressed={formatting?.bold}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <TextBIcon size={18} />
          </IconButton>
          <IconButton
            label="italic"
            aria-pressed={formatting?.italic}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <TextItalicIcon size={18} />
          </IconButton>
          <IconButton
            label="bullet list"
            aria-pressed={formatting?.list}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <ListBulletsIcon size={18} />
          </IconButton>
          <IconButton label="add link" aria-pressed={formatting?.link} onClick={() => onLink()}>
            <LinkIcon size={18} />
          </IconButton>
          <IconButton
            label="undo typing"
            disabled={!formatting?.undo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <ArrowUUpLeftIcon size={17} />
          </IconButton>
          <IconButton
            label="redo typing"
            disabled={!formatting?.redo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <ArrowUUpRightIcon size={17} />
          </IconButton>
        </>
      )}
      <span className="wm-save-status" aria-live="polite">
        {status === "saved" && <CheckIcon size={13} />}
        {status === "saving" && <CircleNotchIcon size={13} className="wm-spin" />}
        {status}
      </span>
    </div>
  );
}
