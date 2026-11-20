import { createContext, useContext, useState, type ReactNode } from "react";
import type { StateSnapshot } from "react-virtuoso";

type Positions = Map<string, StateSnapshot>;
const Context = createContext<Positions | null>(null);

export function ScrollPositionsProvider({ children }: { children: ReactNode }) {
  const [positions] = useState<Positions>(() => new Map());
  return <Context.Provider value={positions}>{children}</Context.Provider>;
}

export function useScrollPositions() {
  const positions = useContext(Context);
  if (!positions) throw new Error("missing mailbox scroll positions");
  return positions;
}
