import { useEffect, useRef, useState, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { applications, type AppId } from "@/lib/desktop/registry";
import { useTheme } from "@/lib/theme";
import { RetroSurface } from "@/ui/retro98";
import { AppIcon } from "./icons";
import { openHref, useDesktop } from "./store";

const launchable = (Object.keys(applications) as AppId[]).filter((id) => id !== "compose");

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

  const run = (action: () => void) => {
    close();
    requestAnimationFrame(action);
  };

  return (
    <Command label="Desktop launcher" loop>
      <div className="v98-launcher-input">
        <MagnifyingGlassIcon size={20} aria-hidden />
        <Command.Input
          ref={input}
          value={search}
          onValueChange={setSearch}
          placeholder="Type an app or action…"
          aria-label="Search apps and actions"
        />
      </div>
      <Command.List>
        <Command.Empty>No matching apps or actions. Try “mail” or “windows”.</Command.Empty>
        <Command.Group heading="Applications">
          {launchable.map((id) => (
            <Command.Item
              key={id}
              value={`${applications[id].title} ${id}`}
              onSelect={() => run(() => void openHref(applications[id].href))}
            >
              <AppIcon icon={applications[id].icon} />
              <span>{applications[id].title}</span>
            </Command.Item>
          ))}
        </Command.Group>
        {windows.length > 0 && (
          <Command.Group heading="Open windows">
            {windows.map((window) => (
              <Command.Item
                key={window.id}
                value={`window ${window.title ?? applications[window.appId].title}`}
                onSelect={() => run(() => dispatch({ type: "activate", id: window.id }))}
              >
                <AppIcon icon={applications[window.appId].icon} />
                <span>{window.title ?? applications[window.appId].title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Desktop">
          <Command.Item
            value="tile windows"
            onSelect={() => run(() => dispatch({ type: "arrange", layout: "tile" }))}
          >
            <span>Tile windows</span>
          </Command.Item>
          <Command.Item
            value="cascade windows"
            onSelect={() => run(() => dispatch({ type: "arrange", layout: "cascade" }))}
          >
            <span>Cascade windows</span>
          </Command.Item>
          <Command.Item
            value="show desktop"
            onSelect={() => run(() => dispatch({ type: "show-desktop" }))}
          >
            <span>Show desktop</span>
          </Command.Item>
          <Command.Item
            value="reset window layout"
            onSelect={() => run(() => dispatch({ type: "reset" }))}
          >
            <span>Reset window layout</span>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}

function LauncherDialog({
  open,
  setOpen,
  returnFocus,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const resolved = useTheme((state) => state.resolved);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <RetroSurface theme={resolved === "light" ? "light" : "graphite"}>
          <Dialog.Backdrop className="v98-launcher-backdrop" />
          <Dialog.Popup className="v98-launcher" initialFocus={input} finalFocus={returnFocus}>
            <div className="v98-launcher-caption">
              <Dialog.Title>Find apps and actions</Dialog.Title>
              <Dialog.Close className="v98-button" aria-label="Close launcher">
                <XIcon size={16} aria-hidden />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Search applications, open windows and desktop actions. Use arrow keys to navigate and
              Enter to choose.
            </Dialog.Description>
            <LauncherPanel close={() => setOpen(false)} input={input} />
            <div className="v98-launcher-footer">
              <span>↑ ↓ Navigate · Enter Open</span>
              <span>Esc Close</span>
            </div>
          </Dialog.Popup>
        </RetroSurface>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Launcher() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

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
    <>
      <button
        ref={trigger}
        type="button"
        className="v98-button v98-launcher-button"
        aria-label="Find apps and actions"
        title="Find apps and actions (Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlassIcon size={18} aria-hidden />
      </button>
      <LauncherDialog open={open} setOpen={setOpen} returnFocus={trigger} />
    </>
  );
}
