import { create } from "zustand";
import { call } from "./invoke";
import { ApiError } from "./errors";

export const passkeyFactor = "@passkey";

type Started = { kind: "started"; code: string; expiresIn: number } | Rejected;
type Rejected = { kind: "rejected"; status: number; code: string };
type Polled = { kind: "waiting" } | { kind: "ready"; proof: unknown } | Rejected;

export type PasskeyPrompt =
  { phase: "idle" } | { phase: "opening" } | { phase: "waiting"; code: string; deadline: number };

type PasskeyState = { prompt: PasskeyPrompt; cancel: () => void };

export const usePasskeyPrompt = create<PasskeyState>(() => ({
  prompt: { phase: "idle" },
  cancel: () => undefined,
}));

const pollInterval = 2000;

function failure(status: number, code: string, message: string) {
  return new ApiError(status, { code, message });
}

function rejection(result: Rejected) {
  if (result.code === "passkey_declined") {
    return failure(401, result.code, "the passkey request was declined in the browser.");
  }
  if (result.status === 404) {
    return failure(404, result.code, "passkey confirmation isn't available right now.");
  }
  return failure(result.status || 400, result.code, "the passkey confirmation expired. try again.");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function passkeyProof(target: Record<string, unknown>): Promise<unknown> {
  let cancelled = false;
  usePasskeyPrompt.setState({
    prompt: { phase: "opening" },
    cancel: () => {
      cancelled = true;
      void call("session_action_passkey_cancel");
    },
  });
  try {
    const started = await call<Started>("session_action_passkey_start", { target });
    if (started.kind === "rejected") throw rejection(started);
    const deadline = Date.now() + started.expiresIn * 1000;
    usePasskeyPrompt.setState((state) => ({
      ...state,
      prompt: { phase: "waiting", code: started.code, deadline },
    }));
    while (!cancelled) {
      if (Date.now() >= deadline)
        throw rejection({ kind: "rejected", status: 401, code: "verification_expired" });
      await wait(pollInterval);
      if (cancelled) break;
      const polled = await call<Polled>("session_action_passkey_poll");
      if (polled.kind === "ready") return polled.proof;
      if (polled.kind === "rejected") throw rejection(polled);
    }
    throw failure(499, "cancelled", "passkey confirmation was cancelled.");
  } finally {
    usePasskeyPrompt.setState({ prompt: { phase: "idle" }, cancel: () => undefined });
  }
}

export async function withPasskey(body: unknown): Promise<unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (record.factor !== passkeyFactor) return body;
  const { factor: _factor, ...target } = record;
  const proof = await passkeyProof(target);
  return { ...target, passkey: proof };
}
