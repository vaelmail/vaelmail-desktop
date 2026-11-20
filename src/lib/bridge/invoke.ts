import { invoke } from "@tauri-apps/api/core";
import { BridgeError, isBridgeFailure } from "./errors";

export const native = "__TAURI_INTERNALS__" in window;

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!native) {
    const { mockInvoke } = await import("./mock");
    return mockInvoke(command, args) as T;
  }
  try {
    return await invoke<T>(command, args);
  } catch (failure) {
    if (isBridgeFailure(failure)) throw new BridgeError(failure);
    throw failure;
  }
}
