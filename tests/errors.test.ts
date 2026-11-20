import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, BridgeError, isBridgeFailure } from "@/lib/bridge/errors";
import { resetMailboxLock, useMailboxLock } from "@/lib/encryption/lock-state";

describe("bridge errors", () => {
  beforeEach(() => resetMailboxLock());

  it("recognises tagged failures", () => {
    expect(isBridgeFailure({ kind: "offline" })).toBe(true);
    expect(isBridgeFailure("boom")).toBe(false);
    expect(isBridgeFailure(null)).toBe(false);
  });

  it("describes each failure for the user", () => {
    expect(new BridgeError({ kind: "offline" }).message).toMatch(/offline/i);
    expect(new BridgeError({ kind: "sessionEnded" }).message).toMatch(/sign in/i);
    expect(new BridgeError({ kind: "challenge", retryAfter: 5 }).message).toMatch(/verifying/i);
    expect(new BridgeError({ kind: "invalid", message: "nope" }).message).toBe("nope");
  });

  it("exposes offline and cancelled shortcuts", () => {
    expect(new BridgeError({ kind: "offline" }).offline).toBe(true);
    expect(new BridgeError({ kind: "cancelled" }).cancelled).toBe(true);
    expect(new BridgeError({ kind: "offline" }).cancelled).toBe(false);
  });

  it("reports a locked mailbox on 423 responses", () => {
    expect(useMailboxLock.getState().locked).toBe(false);
    new ApiError(423, { code: "mailbox_locked", message: "locked" });
    expect(useMailboxLock.getState().locked).toBe(true);
  });

  it("does not report a lock for other failures", () => {
    new ApiError(500, { code: "server_error", message: "boom" });
    expect(useMailboxLock.getState().locked).toBe(false);
  });
});
