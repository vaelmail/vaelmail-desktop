import { call, native } from "./invoke";

const seen = new Set<string>();

export function reportError(message: string, detail = ""): void {
  console.error(message, detail);
  if (!native || seen.has(message) || seen.size > 50) return;
  seen.add(message);
  void call<void>("frontend_error", {
    message: message.slice(0, 500),
    detail: detail.slice(0, 4000),
  }).catch(() => undefined);
}

export function watchErrors(): () => void {
  const onError = (event: ErrorEvent) =>
    reportError(
      event.message || "script error",
      event.error instanceof Error ? (event.error.stack ?? "") : "",
    );
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    if (reason instanceof Error && reason.name === "AbortError") return;
    reportError(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? (reason.stack ?? "") : "",
    );
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
