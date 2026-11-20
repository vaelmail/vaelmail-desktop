import { Command } from "cmdk";
import { Dialog } from "@base-ui/react/dialog";
import { systemViews } from "@/lib/mail/types";
import { useWorkspace } from "@/features/mail/workspace";
import { useMail } from "@/features/mailbox/context";

export function CommandMenu({
  go,
  focusSearch,
  showShortcuts,
  contextActions,
}: {
  go: (view: string) => void;
  focusSearch: () => void;
  showShortcuts: () => void;
  contextActions: [string, () => void][];
}) {
  const open = useWorkspace((s) => s.command),
    setOpen = useWorkspace((s) => s.setCommand),
    { compose, data, refresh } = useMail();
  const actions = [
    ...contextActions,
    ["compose", () => void compose()],
    ["search mail", focusSearch],
    ["refresh mailbox", () => void refresh()],
    ["keyboard shortcuts", showShortcuts],
    ...systemViews.map((v) => [v, () => go(v)] as const),
    ["contacts", () => go("contacts")],
    ["dashboard", () => go("/dashboard")],
    ["plus & billing", () => go("/dashboard/billing")],
    ["account security", () => go("/dashboard/security")],
    ["aliases", () => go("aliases")],
    ["services", () => go("services")],
    ["verification codes", () => go("inbox?category=codes")],
    ["receipts", () => go("inbox?category=receipts")],
    ["settings", () => go("settings/appearance")],
  ].map(([name, action]) => ({
    id: "action:" + name,
    name: String(name),
    action: action as () => void,
  }));
  const folderActions = data.resources.folders.map((f) => ({
    id: "folder:" + f.id,
    name: f.name + " folder",
    action: () => go("folders/" + f.id),
  }));
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="wm-backdrop" />
        <Dialog.Popup className="wm-dialog wm-command">
          <Dialog.Title className="sr-only">quick actions</Dialog.Title>
          <Command>
            <Command.Input placeholder="where would you like to go?" aria-label="quick actions" />
            <Command.List>
              <Command.Empty>no matching actions.</Command.Empty>
              <Command.Group heading="your mailbox">
                {[...actions, ...folderActions].map(({ id, name, action }) => (
                  <Command.Item
                    key={id}
                    value={id}
                    keywords={[name]}
                    onSelect={() => {
                      setOpen(false);
                      action();
                    }}
                  >
                    <span>{String(name)}</span>
                    <span>↗</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
          <p className="wm-command-footer">
            ↑ ↓ navigate <span>↵ choose</span>
            <span>esc close</span>
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
