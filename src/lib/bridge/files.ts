import { invoke } from "@tauri-apps/api/core";
import { call } from "./invoke";
import { on } from "./events";

export type UploadHandle = {
  id: string;
  done: Promise<unknown>;
  cancel: () => void;
};

export const files = {
  download: (path: string, suggestedName: string) =>
    call<{ saved: boolean }>("download", { path, suggestedName }),
  saveText: (suggestedName: string, contents: string) =>
    call<{ saved: boolean }>("save_text", { suggestedName, contents }),
  openExternal: (url: string) => call<void>("open_external", { url }),
  stageAttachment: (path: string, name: string) => call<void>("attachment_stage", { path, name }),
  dragAttachment: (path: string, name: string) => call<boolean>("attachment_drag", { path, name }),
  upload(
    file: File,
    draftId: string,
    generation: number,
    progress: (percent: number) => void,
  ): UploadHandle {
    const id = crypto.randomUUID();
    const listening = on("upload:progress", (event) => {
      if (event.id === id) progress(event.percent);
    });
    const done = file
      .arrayBuffer()
      .then((bytes) =>
        invoke<unknown>("attachment_upload", bytes, {
          headers: {
            "x-upload-id": id,
            "x-draft-id": draftId,
            "x-generation": String(generation),
            "x-file-name": encodeURIComponent(file.name),
            "x-file-type": file.type || "application/octet-stream",
          },
        }),
      )
      .finally(() => void listening.then((unlisten) => unlisten()));
    return { id, done, cancel: () => void call("upload_cancel", { uploadId: id }) };
  },
};
