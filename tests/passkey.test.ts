import { afterEach, describe, expect, it, vi } from "vitest";

const calls: { command: string; args: unknown }[] = [];
const responses: Record<string, unknown[]> = {};

vi.mock("@/lib/bridge/invoke", () => ({
  call: async (command: string, args?: unknown) => {
    calls.push({ command, args });
    const queue = responses[command] ?? [];
    return queue.length > 1 ? queue.shift() : queue[0];
  },
}));

const { passkeyFactor, usePasskeyPrompt, withPasskey } = await import("@/lib/bridge/passkey");

afterEach(() => {
  calls.length = 0;
  for (const key of Object.keys(responses)) delete responses[key];
  vi.useRealTimers();
});

describe("passkey confirmation", () => {
  it("leaves ordinary bodies alone", async () => {
    const body = { action: "totp-disable", accountKey: "1".repeat(16), factor: "123456" };
    expect(await withPasskey(body)).toBe(body);
    expect(await withPasskey(undefined)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("swaps the passkey marker for a browser proof", async () => {
    vi.useFakeTimers();
    responses.session_action_passkey_start = [{ kind: "started", code: "123456", expiresIn: 300 }];
    responses.session_action_passkey_poll = [
      { kind: "waiting" },
      { kind: "ready", proof: { grant: "g" } },
    ];
    const pending = withPasskey({
      action: "inactivity",
      accountKey: "2".repeat(16),
      factor: passkeyFactor,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(usePasskeyPrompt.getState().prompt).toMatchObject({ phase: "waiting", code: "123456" });
    await vi.advanceTimersByTimeAsync(4100);
    expect(await pending).toEqual({
      action: "inactivity",
      accountKey: "2".repeat(16),
      passkey: { grant: "g" },
    });
    expect(calls[0]).toEqual({
      command: "session_action_passkey_start",
      args: { target: { action: "inactivity", accountKey: "2".repeat(16) } },
    });
    expect(usePasskeyPrompt.getState().prompt.phase).toBe("idle");
  });

  it("reports a declined request", async () => {
    vi.useFakeTimers();
    responses.session_action_passkey_start = [{ kind: "started", code: "654321", expiresIn: 300 }];
    responses.session_action_passkey_poll = [
      { kind: "rejected", status: 401, code: "passkey_declined" },
    ];
    const pending = withPasskey({ accountKey: "3".repeat(16), factor: passkeyFactor });
    const outcome = expect(pending).rejects.toThrow(/declined/);
    await vi.advanceTimersByTimeAsync(2100);
    await outcome;
  });
});
