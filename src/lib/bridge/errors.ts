import { isMailboxLockedFailure, reportMailboxLocked } from "@/lib/encryption/lock-state";
import type { ApiFailure } from "@/lib/mail/types";

export type BridgeFailure =
  | { kind: "offline" }
  | { kind: "sessionEnded" }
  | { kind: "challenge"; retryAfter: number }
  | { kind: "cancelled" }
  | { kind: "status"; status: number }
  | { kind: "invalid"; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: ApiFailure,
  ) {
    super(detail.message);
    if (isMailboxLockedFailure(status, detail)) reportMailboxLocked();
  }
}

export class BridgeError extends Error {
  constructor(public failure: BridgeFailure) {
    super(describeFailure(failure));
  }

  get offline(): boolean {
    return this.failure.kind === "offline";
  }

  get cancelled(): boolean {
    return this.failure.kind === "cancelled";
  }
}

function describeFailure(failure: BridgeFailure): string {
  switch (failure.kind) {
    case "offline":
      return "You appear to be offline.";
    case "sessionEnded":
      return "Your session has ended. Sign in again.";
    case "challenge":
      return "VaelMail is verifying traffic. Try again in a moment.";
    case "cancelled":
      return "The request was cancelled.";
    case "status":
      return `The server answered with status ${failure.status}.`;
    case "invalid":
      return failure.message;
  }
}

export function isBridgeFailure(value: unknown): value is BridgeFailure {
  return typeof value === "object" && value !== null && "kind" in value;
}
