import { create } from "zustand";

export type RealtimeStatus = "connecting" | "connected" | "polling" | "offline";

type ConnectionState = {
  status: RealtimeStatus;
  online: boolean;
  setStatus: (status: RealtimeStatus) => void;
  setOnline: (online: boolean) => void;
};

export const useConnection = create<ConnectionState>((set) => ({
  status: "connecting",
  online: true,
  setStatus: (status) => set({ status }),
  setOnline: (online) => set({ online }),
}));

export function connectionLabel(state: Pick<ConnectionState, "status" | "online">): string {
  if (!state.online || state.status === "offline") return "Offline";
  if (state.status === "connected") return "Connected";
  if (state.status === "connecting") return "Connecting…";
  return "Updates by polling";
}
