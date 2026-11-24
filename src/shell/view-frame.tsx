import { memo, useEffect, useState, type ReactNode } from "react";
import { WindowGuardContext, type WindowGuard } from "./close-guard";
import { navigationGuards } from "./store";

export function useGuards(id: string): Set<WindowGuard> {
  const [guards] = useState(() => new Set<WindowGuard>());
  useEffect(() => {
    const run = async () => {
      for (const guard of guards) await guard();
    };
    navigationGuards.set(id, run);
    return () => {
      if (navigationGuards.get(id) === run) navigationGuards.delete(id);
    };
  }, [guards, id]);
  return guards;
}

export const ViewFrame = memo(function ViewFrame({
  id,
  visible,
  label,
  children,
}: {
  id: string;
  visible: boolean;
  label: string;
  children: ReactNode;
}) {
  const guards = useGuards(id);
  return (
    <WindowGuardContext.Provider value={guards}>
      <section
        className="vx-view v98-window-content"
        hidden={!visible}
        aria-label={label}
        data-view={id}
      >
        {children}
      </section>
    </WindowGuardContext.Provider>
  );
});
