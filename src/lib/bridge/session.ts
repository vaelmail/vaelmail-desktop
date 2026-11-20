import { call } from "./invoke";

export type SessionOutcome =
  | { kind: "signedIn" }
  | { kind: "factor"; methods: string[] }
  | { kind: "waiting" }
  | { kind: "rejected"; status: number; code: string };

export type PasskeyHandoff =
  | { kind: "started"; code: string; expiresIn: number }
  | { kind: "rejected"; status: number; code: string };

export const session = {
  status: () => call<{ signedIn: boolean }>("session_status"),
  start: (accountKey: string) => call<SessionOutcome>("session_start", { accountKey }),
  finish: (factor: string) => call<SessionOutcome>("session_finish", { factor }),
  passkeyStart: () => call<PasskeyHandoff>("session_passkey_start"),
  passkeyPoll: () => call<SessionOutcome>("session_passkey_poll"),
  passkeyCancel: () => call<void>("session_passkey_cancel"),
  end: () => call<void>("session_end"),
};
