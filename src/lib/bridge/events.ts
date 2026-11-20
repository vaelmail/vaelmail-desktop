import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { native } from "./invoke";
import type { RealtimeStatus } from "@/features/connection/store";

export type SessionEndReason = "expired" | "revoked" | "signedOut";

export type UpdateInfo = { version: string; notes: string };

export type BridgeEvents = {
  "realtime:status": RealtimeStatus;
  "realtime:snapshot": unknown;
  "realtime:refresh": { scopes?: string[] };
  "session:ended": { reason: SessionEndReason };
  "challenge:required": { retryAfter: number };
  "notification:activated": { threadId: string | null };
  "mailto:pending": null;
  "mail:arrived": number;
  "network:online": boolean;
  "updates:available": UpdateInfo;
  "updates:progress": { received: number; total: number | null };
  "tray:compose": null;
  "shell:inbox": null;
  "upload:progress": { id: string; percent: number };
};

export function on<K extends keyof BridgeEvents>(
  name: K,
  handler: (payload: BridgeEvents[K]) => void,
): Promise<UnlistenFn> {
  if (!native) return Promise.resolve(() => undefined);
  return listen<BridgeEvents[K]>(name, (event) => handler(event.payload));
}
