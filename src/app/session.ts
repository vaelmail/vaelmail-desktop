import { create } from "zustand";
import { bridge, on } from "@/lib/bridge";
import type { SessionEndReason } from "@/lib/bridge/events";

type SessionPhase = "loading" | "signedOut" | "signedIn";

type SessionState = {
  phase: SessionPhase;
  notice: SessionEndReason | null;
  refresh: () => Promise<void>;
  signedIn: () => void;
  end: (reason: SessionEndReason) => void;
  signOut: () => Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  phase: "loading",
  notice: null,
  async refresh() {
    try {
      const { signedIn } = await bridge.session.status();
      set({ phase: signedIn ? "signedIn" : "signedOut" });
    } catch {
      set({ phase: "signedOut" });
    }
  },
  signedIn: () => set({ phase: "signedIn", notice: null }),
  end: (reason) => set({ phase: "signedOut", notice: reason }),
  async signOut() {
    await bridge.session.end();
  },
}));

export function watchSession(): () => void {
  const listening = on("session:ended", ({ reason }) => {
    useSession.getState().end(reason);
  });
  return () => void listening.then((unlisten) => unlisten());
}
