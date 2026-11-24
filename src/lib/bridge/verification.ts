import { call } from "./invoke";

export type VerificationState =
  | { phase: "checking"; level: number }
  | { phase: "captcha"; image: string; waitSeconds: number; wrong: boolean }
  | { phase: "done" }
  | { phase: "failed"; retryAfter: number };

export const verification = {
  answer: (code: string) => call<void>("verification_reply", { action: "code", code }),
  newImage: () => call<void>("verification_reply", { action: "image" }),
};
