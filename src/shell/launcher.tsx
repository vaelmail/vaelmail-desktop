import { useEffect, useRef, useState, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import {
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PencilSimpleIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useOptionalMail } from "@/features/mailbox/context";
import { bridge } from "@/lib/bridge";
import { applications, type AppId } from "@/lib/desktop/registry";
import { useTheme } from "@/lib/theme";
import { RetroSurface } from "@/ui/retro98";
import { AppIcon } from "./icons";
import { openHref, useDesktop } from "./store";

const launchable = (Object.keys(applications) as AppId[]).filter((id) => id !== "compose");

const folders = [
  ["Inbox", "/webmail/inbox"],
  ["Starred", "/webmail/starred"],
  ["Sent", "/webmail/sent"],
  ["Drafts", "/webmail/drafts"],
  ["Scheduled", "/webmail/scheduled"],
  ["Archive", "/webmail/archive"],
  ["Spam", "/webmail/spam"],
  ["Trash", "/webmail/trash"],
] as const;

function LauncherPanel({
  close,
  input,
}: {
  close: () => void;
  input: RefObject<HTMLInputElement | null>;
}) {
  const [search, setSearch] = useState("");
  const windows = useDesktop((state) => state.windows);
  const dispatch = useDesktop((state) => state.dispatch);
  const mail = useOptionalMail();
  const resolved = useTheme((state) => state.resolved);
  const drafts = windows.filter((window) => window.appId === "compose");

  const run = (action: () => void) => {
    close();
    requestAnimationFrame(action);
  };

  return (
    <Command label="Go to anything" loop>
      <div className="vx-launcher-input">
        <MagnifyingGlassIcon size={18} aria-hidden />
        <Command.Input
          ref={input}
          value={search}
          onValueChange={setSearch}
          placeholder="Search folders, pages and actions"
          aria-label="Search folders, pages and actions"
        />
      </div>
      <Command.List>
        <Command.Empty>Nothing matches. Try “inbox”, “aliases” or “new”.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item
            value="new message compose write"
            disabled={!mail}
            onSelect={() => run(() => void mail?.compose())}
          >
            <PencilSimpleIcon size={18} aria-hidden />
            <span>New message</span>
          </Command.Item>
          <Command.Item
            value="check mail refresh sync reconnect"
            onSelect={() =>
              run(() => {
                void bridge.realtime.reconnect();
                void mail?.refresh();
              })
            }
          >
            <ArrowClockwiseIcon size={18} aria-hidden />
            <span>Check for new mail</span>
          </Command.Item>
          <Command.Item
            value="switch theme dark light appearance"
            onSelect={() => run(() => void openHref(applications.appearance.href))}
          >
            {resolved === "light" ? <MoonIcon size={18} /> : <SunIcon size={18} />}
            <span>Change theme</span>
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Folders">
          {folders.map(([label, href]) => (
            <Command.Item
              key={href}
              value={`folder ${label}`}
              onSelect={() => run(() => void openHref(href))}
            >
              <AppIcon icon="mail" size={18} />
              <span>{label}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Go to">
          {launchable.map((id) => (
            <Command.Item
              key={id}
              value={`${applications[id].title} ${id}`}
              onSelect={() => run(() => void openHref(applications[id].href))}
            >
              <AppIcon icon={applications[id].icon} size={18} />
              <span>{applications[id].title}</span>
            </Command.Item>
          ))}
        </Command.Group>
        {drafts.length > 0 && (
          <Command.Group heading="Open drafts">
            {drafts.map((window) => (
              <Command.Item
                key={window.id}
                value={`draft ${window.title ?? applications.compose.title}`}
                onSelect={() => run(() => dispatch({ type: "activate", id: window.id }))}
              >
                <AppIcon icon="compose" size={18} />
                <span>{window.title ?? applications.compose.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}

export function Launcher() {
  const [open, setOpen] = useState(false);
  const resolved = useTheme((state) => state.resolved);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      const combo = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);
      if (!combo || event.altKey || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen((current) => !current);
    };
    const request = () => setOpen(true);
    window.addEventListener("keydown", toggle, true);
    window.addEventListener("vael:launcher", request);
    return () => {
      window.removeEventListener("keydown", toggle, true);
      window.removeEventListener("vael:launcher", request);
    };
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <RetroSurface theme={resolved === "light" ? "light" : "graphite"}>
          <Dialog.Backdrop className="vx-scrim" data-soft />
          <Dialog.Popup className="vx-launcher" initialFocus={input}>
            <Dialog.Title className="sr-only">Go to anything</Dialog.Title>
            <Dialog.Description className="sr-only">
              Search folders, pages and actions. Use the arrow keys to move and Enter to open.
            </Dialog.Description>
            <LauncherPanel close={() => setOpen(false)} input={input} />
            <div className="vx-launcher-footer">
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> move
              </span>
              <span>
                <kbd>Enter</kbd> open
              </span>
              <span>
                <kbd>Esc</kbd> close
              </span>
            </div>
          </Dialog.Popup>
        </RetroSurface>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
