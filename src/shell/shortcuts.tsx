import { applications, type AppId } from "@/lib/desktop/registry";
import { AppIcon } from "./icons";
import { openHref, useDesktop } from "./store";

const shortcutIds: AppId[] = [
  "mail",
  "contacts",
  "aliases",
  "services",
  "account",
  "settings",
  "security",
  "appearance",
];

const cellWidth = 98;
const cellHeight = 88;
const margin = 6;
const reservedBottom = 92;

export function DesktopShortcuts() {
  const height = useDesktop((state) => state.viewport.height);
  const rows = Math.max(1, Math.floor((height - reservedBottom) / cellHeight));

  return (
    <nav className="v98-desktop-shortcuts" aria-label="Desktop applications" tabIndex={-1}>
      {shortcutIds.map((id, index) => {
        const definition = applications[id];
        return (
          <button
            type="button"
            key={id}
            data-shortcut={id}
            data-icon={definition.icon}
            style={{
              left: margin + Math.floor(index / rows) * cellWidth,
              top: 10 + (index % rows) * cellHeight,
            }}
            onClick={() => void openHref(definition.href)}
          >
            <AppIcon icon={definition.icon} size={34} />
            <span>{definition.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
