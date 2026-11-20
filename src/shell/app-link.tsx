import type { ComponentProps, MouseEvent } from "react";
import { resolveApplication } from "@/lib/desktop/registry";
import { openHref } from "./store";
import { useWindow, useWindowLocation } from "./window-context";

function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function AppLink({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const { appId, instanceId } = useWindow();
  const { navigate } = useWindowLocation();

  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !plainClick(event)) return;
        event.preventDefault();
        const target = resolveApplication(href);
        if (!target) return;
        if (target.appId === appId && !instanceId) void navigate(href);
        else void openHref(href);
      }}
    />
  );
}

export const WorkspaceLink = AppLink;
