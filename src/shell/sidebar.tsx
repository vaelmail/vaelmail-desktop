import { useEffect, useState } from "react";
import { PencilSimpleIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { useOptionalMail } from "@/features/mailbox/context";
import { applications, type AppId } from "@/lib/desktop/registry";
import { AppIcon } from "./icons";
import { modifierLabel } from "./platform";
import { openHref } from "./store";

const groups: { label: string; ids: AppId[] }[] = [
  { label: "Mail", ids: ["mail", "contacts", "aliases", "services"] },
  { label: "Account", ids: ["account", "domains", "security", "billing", "data"] },
];

const footer: AppId[] = ["settings", "appearance", "desktop-settings", "about"];

const shortTitles: Partial<Record<AppId, string>> = {
  account: "Account",
  billing: "Plus & billing",
  "desktop-settings": "App settings",
  about: "About",
};

const COLLAPSED_KEY = "vael:sidebar-collapsed";

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "1",
  );
  const update = (next: boolean) => {
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    setCollapsed(next);
  };
  return [collapsed, update];
}

function Item({
  id,
  current,
  collapsed,
  badge,
}: {
  id: AppId;
  current: AppId | null;
  collapsed: boolean;
  badge?: number;
}) {
  const title = shortTitles[id] ?? applications[id].title;
  return (
    <button
      type="button"
      className="vx-nav-item"
      aria-current={current === id ? "page" : undefined}
      title={collapsed ? title : undefined}
      onClick={() => void openHref(applications[id].href)}
    >
      <AppIcon icon={applications[id].icon} size={19} />
      <span className="vx-nav-label">{title}</span>
      {!!badge && (
        <span className="vx-nav-badge" aria-label={`${badge} unread`}>
          {badge > 999 ? "999+" : badge}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  current,
  collapsed,
  onCollapse,
}: {
  current: AppId | null;
  collapsed: boolean;
  onCollapse: (next: boolean) => void;
}) {
  const mail = useOptionalMail();
  const unread = mail?.data.counts.inbox ?? 0;
  const address = mail?.data.mailbox.address ?? "";
  const plan = mail?.data.mailbox.plan;

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
      <div className="vx-sidebar-top">
        <button
          type="button"
          className="vx-compose"
          onClick={() => void mail?.compose()}
          disabled={!mail}
          title={collapsed ? "New message" : undefined}
        >
          <PencilSimpleIcon size={18} weight="bold" />
          <span className="vx-nav-label">New message</span>
        </button>
      </div>
      <div className="vx-sidebar-scroll">
        {groups.map((group) => (
          <div key={group.label} className="vx-nav-group" role="group" aria-label={group.label}>
            <span className="vx-nav-heading">{group.label}</span>
            {group.ids.map((id) => (
              <Item
                key={id}
                id={id}
                current={current}
                collapsed={collapsed}
                badge={id === "mail" ? unread : undefined}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="vx-sidebar-bottom">
        {footer.map((id) => (
          <Item key={id} id={id} current={current} collapsed={collapsed} />
        ))}
        <div className="vx-identity" title={address}>
          <span className="vx-avatar" aria-hidden>
            {(address[0] ?? "v").toUpperCase()}
          </span>
          <span className="vx-identity-text">
            <span className="vx-identity-address" translate="no">
              {address || "VaelMail"}
            </span>
            <span className="vx-identity-plan">{plan === "plus" ? "Plus" : "Free"}</span>
          </span>
          <button
            type="button"
            className="vx-icon-button vx-collapse"
            onClick={() => onCollapse(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (${modifierLabel}+\\)`}
          >
            <SidebarSimpleIcon size={17} />
          </button>
        </div>
      </div>
    </nav>
  );
}
