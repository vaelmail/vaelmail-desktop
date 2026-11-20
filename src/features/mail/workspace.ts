import { create } from "zustand";
import { openLocation, useDesktop } from "@/shell/store";

type Workspace = {
  command: boolean;
  composers: string[];
  draftNames: Record<string, string>;
  minimized: string[];
  maximized: string | null;
  setCommand: (open: boolean) => void;
  openDraft: (id: string) => void;
  closeDraft: (id: string) => void;
  nameDraft: (id: string, name: string) => void;
  minimize: (id: string) => void;
  maximize: (id: string | null) => void;
};

const windowId = (draft: string) => `compose:${draft}`;
const defaultTitle = "New message";

export const useWorkspace = create<Workspace>(() => ({
  command: false,
  composers: [],
  draftNames: {},
  minimized: [],
  maximized: null,
  setCommand: (command) => useWorkspace.setState({ command }),
  openDraft: (id) => openLocation({ appId: "compose", href: "/webmail/compose", instanceId: id }),
  closeDraft: (id) => useDesktop.getState().dispatch({ type: "close", id: windowId(id) }),
  nameDraft: (id, name) =>
    useDesktop
      .getState()
      .dispatch({ type: "title", id: windowId(id), title: name.trim() || defaultTitle }),
  minimize: (id) => useDesktop.getState().dispatch({ type: "minimize", id: windowId(id) }),
  maximize: (id) => {
    if (id) useDesktop.getState().dispatch({ type: "maximize", id: windowId(id) });
  },
}));

useDesktop.subscribe((state) => {
  const composers = state.windows.flatMap((window) =>
    window.appId === "compose" && window.instanceId ? [window.instanceId] : [],
  );
  const current = useWorkspace.getState().composers;
  if (composers.length !== current.length || composers.some((id, index) => id !== current[index])) {
    useWorkspace.setState({ composers });
  }
});
