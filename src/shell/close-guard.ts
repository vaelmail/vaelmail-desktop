import { createContext, useContext, useEffect } from "react";

export type WindowGuard = () => void | Promise<void>;

export const WindowGuardContext = createContext<Set<WindowGuard> | null>(null);

export function useWindowCloseGuard(guard: WindowGuard): void {
  const guards = useContext(WindowGuardContext);
  useEffect(() => {
    if (!guards) return;
    guards.add(guard);
    return () => {
      guards.delete(guard);
    };
  }, [guards, guard]);
}
