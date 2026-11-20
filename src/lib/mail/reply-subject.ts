const replyPrefix = /^\s*(re|aw|sv|antw)\s*(\[\d+\])?\s*:/i;
const forwardPrefix = /^\s*(fwd?|wg|tr|rv)\s*(\[\d+\])?\s*:/i;

export function replySubject(subject: string, mode: "reply" | "all" | "forward"): string {
  const base = subject.trim();
  if (mode === "forward") return forwardPrefix.test(base) ? base : "Fwd: " + base;
  return replyPrefix.test(base) ? base : "Re: " + base;
}
