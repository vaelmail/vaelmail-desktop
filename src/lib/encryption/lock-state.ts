import { create } from "zustand";

type LockState = {
  locked: boolean;
  prompt: boolean;
  unlocks: number;
  locks: number;
};

export const useMailboxLock = create<LockState>(() => ({
  locked: false,
  prompt: false,
  unlocks: 0,
  locks: 0,
}));

export function reportMailboxLocked(openPrompt = true) {
  const state = useMailboxLock.getState();
  if (state.locked && (state.prompt || !openPrompt)) return;
  useMailboxLock.setState({
    locked: true,
    prompt: state.prompt || (openPrompt && !state.locked),
    ...(state.locked ? {} : { locks: state.locks + 1 }),
  });
}

export function openUnlockPrompt() {
  useMailboxLock.setState({ prompt: true, locked: true });
}

export function dismissUnlockPrompt() {
  useMailboxLock.setState({ prompt: false });
}

export function markMailboxUnlocked() {
  useMailboxLock.setState((s) => ({
    locked: false,
    prompt: false,
    unlocks: s.unlocks + 1,
  }));
}

export function markMailboxLocked() {
  useMailboxLock.setState((s) => ({
    locked: true,
    prompt: false,
    locks: s.locks + 1,
  }));
}

export function resetMailboxLock() {
  useMailboxLock.setState((s) => ({
    locked: false,
    prompt: false,
    locks: s.locks + 1,
  }));
}

export function onMailboxLock(listener: () => void) {
  return useMailboxLock.subscribe((next, previous) => {
    if (next.locks !== previous.locks) listener();
  });
}

export function isMailboxLockedFailure(
  status: number,
  detail: { code?: unknown } | null | undefined,
) {
  return status === 423 && detail?.code === "mailbox_locked";
}
