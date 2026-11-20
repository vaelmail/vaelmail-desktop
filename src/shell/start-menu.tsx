import { Menu } from "@base-ui/react/menu";
import { DesktopIcon } from "@phosphor-icons/react";
import { applications, type AppId } from "@/lib/desktop/registry";
import { useTheme } from "@/lib/theme";
import { RetroSurface } from "@/ui/retro98";
import { BrandMark } from "./brand";
import { AppIcon } from "./icons";
import { openHref, useDesktop } from "./store";

const groups: { label: string; ids: AppId[] }[] = [
  { label: "Mail & contacts", ids: ["mail", "contacts", "aliases", "services"] },
  {
    label: "Your account",
    ids: ["account", "domains", "security", "billing", "data"],
  },
  { label: "Preferences", ids: ["settings", "appearance", "desktop-settings", "about"] },
];

export function StartMenu({ onSignOut }: { onSignOut: () => void }) {
  const resolved = useTheme((state) => state.resolved);
  const dispatch = useDesktop((state) => state.dispatch);
  const windows = useDesktop((state) => state.windows);
  const viewport = useDesktop((state) => state.viewport);
  const anyVisible = windows.some((window) => window.mode !== "minimized");
  const canArrange = anyVisible && viewport.width >= 768;

  return (
    <Menu.Root>
      <Menu.Trigger className="v98-button v98-start-button">
        <BrandMark />
        <span>Vael</span>
      </Menu.Trigger>
      <Menu.Portal>
        <RetroSurface theme={resolved === "light" ? "light" : "graphite"}>
          <Menu.Positioner side="top" align="start" sideOffset={5} className="v98-menu-positioner">
            <Menu.Popup className="v98-menu-popup v98-start-menu">
              <div className="v98-start-heading">VaelMail</div>
              <Menu.Item
                className="v98-menu-item"
                onClick={() => window.dispatchEvent(new Event("vael:launcher"))}
              >
                Find apps and actions <kbd>Ctrl/Cmd+K</kbd>
              </Menu.Item>
              {groups.map((group) => (
                <Menu.Group key={group.label}>
                  <Menu.GroupLabel className="v98-start-group-label">{group.label}</Menu.GroupLabel>
                  {group.ids.map((id) => (
                    <Menu.Item
                      key={id}
                      className="v98-menu-item"
                      onClick={() => void openHref(applications[id].href)}
                    >
                      <AppIcon icon={applications[id].icon} />
                      <span>{applications[id].title}</span>
                    </Menu.Item>
                  ))}
                </Menu.Group>
              ))}
              <Menu.Separator className="v98-start-separator" />
              <Menu.Item
                className="v98-menu-item"
                disabled={!canArrange}
                onClick={() => dispatch({ type: "arrange", layout: "tile" })}
              >
                Tile windows
              </Menu.Item>
              <Menu.Item
                className="v98-menu-item"
                disabled={!canArrange}
                onClick={() => dispatch({ type: "arrange", layout: "cascade" })}
              >
                Cascade windows
              </Menu.Item>
              <Menu.Item className="v98-menu-item" onClick={() => dispatch({ type: "reset" })}>
                <DesktopIcon size={20} aria-hidden />
                <span>Reset window layout</span>
              </Menu.Item>
              <Menu.Separator className="v98-start-separator" />
              <Menu.Item className="v98-menu-item" onClick={onSignOut}>
                Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </RetroSurface>
      </Menu.Portal>
    </Menu.Root>
  );
}
