import { bridge, BridgeError } from "@/lib/bridge";
import type { RecoveryRecord } from "@/lib/bridge/recovery";

export { api, ApiError } from "@/lib/bridge";

export const remainingTime = (deadline: string) => Math.max(0, Date.parse(deadline) - Date.now());

export function download(path: string, suggestedName = "download") {
  return bridge.files.download(path, suggestedName);
}

export const recoveryKey = (mailboxId: string, generation: number, id: string) =>
  `${mailboxId}:${generation}:${id}`;

export function storeRecovery(
  key: string,
  mailboxId: string,
  generation: number,
  draft: RecoveryRecord["draft"],
) {
  return bridge.recovery.put({ key, mailboxId, generation, draft, savedAt: Date.now() });
}

export function wipeDraftRecovery(): Promise<void> {
  return bridge.recovery.clear().catch(() => undefined);
}

export const recovery = {
  drafts: {
    put: (record: RecoveryRecord) => bridge.recovery.put(record),
    delete: (key: string) => bridge.recovery.remove(key),
    async get(key: string): Promise<RecoveryRecord | undefined> {
      const mailboxId = key.split(":")[0] ?? "";
      const records = await bridge.recovery.list(mailboxId);
      return records.find((record) => record.key === key);
    },
    where: (_field: "mailboxId") => ({
      equals: (_mailboxId: string) => ({ delete: () => bridge.recovery.clear() }),
    }),
  },
};

type UploadHandlers = {
  progress: (percent: number) => void;
  done: (value: unknown) => void;
  fail: (message: string) => void;
  cancel: () => void;
};

export function startUpload(
  file: File,
  draftId: string,
  generation: number,
  handlers: UploadHandlers,
) {
  const upload = bridge.files.upload(file, draftId, generation, handlers.progress);
  upload.done.then(handlers.done, (failure: unknown) => {
    if (failure instanceof BridgeError && failure.cancelled) handlers.cancel();
    else handlers.fail(failure instanceof Error ? failure.message : "upload failed");
  });
  return { abort: () => upload.cancel() };
}
