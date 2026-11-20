import { create } from "zustand";

export type ThemeChoice = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const storageKey = "vael-theme";
const query = "(prefers-color-scheme: dark)";

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "light" || stored === "system" ? stored : "dark";
  } catch {
    return "dark";
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return window.matchMedia(query).matches ? "dark" : "light";
  return choice;
}

function apply(theme: ResolvedTheme) {
  document.documentElement.dataset.vaelTheme = theme;
}

type ThemeState = {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
};

export const useTheme = create<ThemeState>((set, get) => {
  const choice = readChoice();
  const resolved = resolve(choice);
  apply(resolved);

  window.matchMedia(query).addEventListener("change", () => {
    if (get().choice !== "system") return;
    const next = resolve("system");
    apply(next);
    set({ resolved: next });
  });

  return {
    choice,
    resolved,
    setChoice(next) {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        return;
      } finally {
        const nextResolved = resolve(next);
        apply(nextResolved);
        set({ choice: next, resolved: nextResolved });
      }
    },
  };
});

export function useNextTheme() {
  const choice = useTheme((state) => state.choice);
  const resolved = useTheme((state) => state.resolved);
  const setChoice = useTheme((state) => state.setChoice);
  return { theme: choice, resolvedTheme: resolved, setTheme: setChoice };
}
