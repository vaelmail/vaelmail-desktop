import { create } from "zustand";
import { on } from "@/lib/bridge";
import type { VerificationState } from "@/lib/bridge/verification";

type Store = {
  state: VerificationState | null;
  open: boolean;
  deadline: number;
  setOpen: (open: boolean) => void;
};

export const useVerification = create<Store>((set) => ({
  state: null,
  open: false,
  deadline: 0,
  setOpen: (open) => set({ open }),
}));

let clearTimer = 0;

function apply(next: VerificationState) {
  window.clearTimeout(clearTimer);
  if (next.phase === "captcha") {
    useVerification.setState((current) => ({
      state: next,
      deadline: Date.now() + next.waitSeconds * 1000,
      open: current.state?.phase === "captcha" ? current.open : true,
    }));
    return;
  }
  useVerification.setState({ state: next, open: false });
  if (next.phase === "done" || next.phase === "failed") {
    clearTimer = window.setTimeout(
      () => useVerification.setState({ state: null }),
      next.phase === "done" ? 2200 : 6000,
    );
  }
}

export function watchVerification(): () => void {
  const listening = on("verification:state", apply);
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("verify") === "captcha"
  ) {
    apply({
      phase: "captcha",
      image:
        "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",
      waitSeconds: 28,
      wrong: false,
    });
  }
  return () => void listening.then((unlisten) => unlisten());
}
