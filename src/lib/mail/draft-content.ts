import type { Draft } from "./types";

export function draftContentKey(draft: Draft) {
  return JSON.stringify({
    identityId: draft.identityId,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    html: draft.html,
    editor: draft.editor,
    plain: draft.plain,
    trackOpens: draft.trackOpens ?? false,
    attachmentIds: draft.attachmentIds,
    threadId: draft.threadId,
    replyToMessageId: draft.replyToMessageId ?? null,
    quote: draft.quote,
  });
}
