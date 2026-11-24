import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { PencilSimpleIcon, SidebarSimpleIcon, SignOutIcon } from "@phosphor-icons/react";
import { useOptionalMail } from "@/features/mailbox/context";
import { applications, type AppId } from "@/lib/desktop/registry";
import { useTheme } from "@/lib/theme";
import { RetroSurface } from "@/ui/retro98";
import { AppIcon } from "./icons";
import { modifierLabel } from "./platform";
import { openHref } from "./store";

const primary: AppId[] = ["mail", "contacts", "aliases", "services", "account"];
const secondary: AppId[] = ["settings", "desktop-settings"];
const accountViews: AppId[] = ["account", "domains", "security", "billing", "data"];

const labels: Partial<Record<AppId, { short: string; long: string }>> = {
  account: { short: "Account", long: "My account" },
  settings: { short: "Settings", long: "Mail settings" },
  "desktop-settings": { short: "App", long: "App settings" },
};

const STORAGE_KEY = "vael:sidebar";
const shortcuts: AppId[] = ["mail", "contacts", "aliases", "services", "account", "settings"];

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== "expanded",
  );
  const update = (next: boolean) => {
    localStorage.setItem(STORAGE_KEY, next ? "rail" : "expanded");
    setCollapsed(next);
  };
  return [collapsed, update];
}

function Item({
  id,
  active,
  collapsed,
  badge,
}: {
  id: AppId;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  const label = labels[id] ?? { short: applications[id].title, long: applications[id].title };
  const shortcut = shortcuts.indexOf(id) + 1 || null;
  return (
    <button
      type="button"
      className="vx-nav-item"
      aria-current={active ? "page" : undefined}
      aria-label={label.long}
      title={shortcut ? `${label.long} (${modifierLabel}+${shortcut})` : label.long}
      onClick={() => void openHref(applications[id].href)}
    >
      <span className="vx-nav-icon">
        <AppIcon icon={applications[id].icon} size={20} />
        {!!badge && (
          <span className="vx-nav-badge" aria-label={`${badge} unread`}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="vx-nav-label">{collapsed ? label.short : label.long}</span>
    </button>
  );
}

function AccountMenu({
  collapsed,
  onCollapse,
  onSignOut,
}: {
  collapsed: boolean;
  onCollapse: (next: boolean) => void;
  onSignOut: () => void;
}) {
  const mail = useOptionalMail();
  const resolved = useTheme((state) => state.resolved);
  const address = mail?.data.mailbox.address ?? "";
  const plan = mail?.data.mailbox.plan === "plus" ? "Plus" : "Free";
  return (
    <Menu.Root>
      <Menu.Trigger
        className="vx-identity"
        aria-label={`Account menu for ${address || "VaelMail"}`}
      >
        <span className="vx-avatar" aria-hidden>
          {(address[0] ?? "v").toUpperCase()}
        </span>
        <span className="vx-identity-text">
          <span className="vx-identity-address" translate="no">
            {address || "VaelMail"}
          </span>
          <span className="vx-identity-plan">{plan}</span>
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <RetroSurface theme={resolved === "light" ? "light" : "graphite"}>
          <Menu.Positioner side="right" align="end" sideOffset={10} className="vx-menu-positioner">
            <Menu.Popup className="vx-menu">
              <div className="vx-menu-head">
                <strong translate="no">{address}</strong>
                <span>{plan} plan</span>
              </div>
              <Menu.Item
                className="vx-menu-item"
                onClick={() => void openHref(applications.appearance.href)}
              >
                <AppIcon icon="appearance" size={17} />
                Appearance
              </Menu.Item>
              <Menu.Item
                className="vx-menu-item"
                onClick={() => void openHref(applications.about.href)}
              >
                <AppIcon icon="about" size={17} />
                About VaelMail
              </Menu.Item>
              <Menu.Item className="vx-menu-item" onClick={() => onCollapse(!collapsed)}>
                <SidebarSimpleIcon size={17} />
                {collapsed ? "Show labels in the sidebar" : "Use the narrow sidebar"}
                <kbd>{modifierLabel} \</kbd>
              </Menu.Item>
              <Menu.Separator className="vx-menu-separator" />
              <Menu.Item className="vx-menu-item" data-danger onClick={onSignOut}>
                <SignOutIcon size={17} />
                Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </RetroSurface>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function Sidebar({
  current,
  collapsed,
  onCollapse,
  onSignOut,
}: {
  current: AppId | null;
  collapsed: boolean;
  onCollapse: (next: boolean) => void;
  onSignOut: () => void;
}) {
  const mail = useOptionalMail();
  const unread = mail?.data.counts.inbox ?? 0;
  const selected = (id: AppId) =>
    id === "account" ? accountViews.includes(current ?? "mail") : current === id;

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "\\") {
        event.preventDefault();
        onCollapse(!collapsed);
      }
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, [collapsed, onCollapse]);

  return (
    <nav className="vx-sidebar" data-collapsed={collapsed || undefined} aria-label="VaelMail">
      <button
        type="button"
        className="vx-compose"
        onClick={() => void mail?.compose()}
        disabled={!mail}
        aria-label="New message"
        title={collapsed ? "New message (C)" : undefined}
      >
        <PencilSimpleIcon size={19} weight="bold" />
        <span className="vx-nav-label">{collapsed ? "Write" : "New message"}</span>
      </button>
      <div className="vx-nav-group">
        {primary.map((id) => (
          <Item
            key={id}
            id={id}
            active={selected(id)}
            collapsed={collapsed}
            badge={id === "mail" ? unread : undefined}
          />
        ))}
      </div>
      <div className="vx-nav-group vx-nav-bottom">
        {secondary.map((id) => (
          <Item key={id} id={id} active={selected(id)} collapsed={collapsed} />
        ))}
        <AccountMenu collapsed={collapsed} onCollapse={onCollapse} onSignOut={onSignOut} />
      </div>
    </nav>
  );
}
