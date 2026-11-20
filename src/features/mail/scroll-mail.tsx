import { useEffect, useRef, type ComponentProps } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { MailItem } from "@/lib/mail/types";
import { useScrollPositions } from "./scroll-positions";
export function ScrollMail({
  cacheKey,
  ...props
}: ComponentProps<typeof Virtuoso<MailItem>> & { cacheKey: string }) {
  const ref = useRef<VirtuosoHandle>(null);
  const positions = useScrollPositions();
  useEffect(() => {
    const instance = ref.current;
    return () => {
      instance?.getState((snapshot) => {
        positions.delete(cacheKey);
        positions.set(cacheKey, snapshot);
        if (positions.size > 20) positions.delete(positions.keys().next().value!);
      });
    };
  }, [cacheKey, positions]);
  return <Virtuoso {...props} ref={ref} restoreStateFrom={positions.get(cacheKey)} />;
}
