import { toast } from "sonner";
import {
  ArchiveIcon,
  ClockIcon,
  EnvelopeIcon,
  FolderSimpleIcon,
  GearSixIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  SidebarSimpleIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  UsersIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Brand } from "@/shell/brand";
import { WorkspaceLink } from "@/shell/app-link";
import { formatBytes, systemViews, type MailAction } from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import { Button, IconButton, MailLink as Link } from "@/ui/controls";

const icons = {
  inbox: EnvelopeIcon,
  starred: StarIcon,
  sent: PaperPlaneTiltIcon,
  drafts: PencilSimpleIcon,
  scheduled: ClockIcon,
  snoozed: ClockIcon,
  archive: ArchiveIcon,
  spam: WarningCircleIcon,
  trash: TrashIcon,
  all: HouseIcon,
};

export function MailNavigation({
  view,
  settings,
  desktop,
  collapsed,
  toggleCollapse,
  selection,
  compose,
  go,
  runAction,
  closeNav,
  clearSelection,
}: {
  view: string;
  settings: boolean;
  desktop: boolean;
  collapsed: boolean;
  toggleCollapse: () => void;
  selection: string[];
  compose: () => unknown;
  go: (destination: string) => void;
  runAction: (type: MailAction["type"], value?: string, ids?: string[]) => Promise<void>;
  closeNav: () => void;
  clearSelection: () => void;
}) {
  const { data } = useMail();
  const mailboxLink = (v: (typeof systemViews)[number]) => {
    const Icon = icons[v];
    return (
      <Link
        href={"/webmail/" + v}
        aria-label={v === "all" ? "all mail" : v}
        title={v === "all" ? "all mail" : v}
        key={v}
        aria-current={view === v ? "page" : undefined}
        onClick={() => {
          closeNav();
          clearSelection();
        }}
        className={view === v ? "active" : ""}
      >
        <Icon size={18} weight={view === v ? "fill" : "regular"} />
        <span>{v === "all" ? "all mail" : v}</span>
        {!!data.counts[v] && <span className="wm-count">{data.counts[v]}</span>}
      </Link>
    );
  };
  return (
    <>
      <div className="wm-nav-brand">
        <Brand href="/" />
        <IconButton
          className="wm-collapse-navigation"
          label={collapsed ? "expand navigation" : "collapse navigation"}
          aria-expanded={!collapsed}
          onClick={toggleCollapse}
        >
          <SidebarSimpleIcon size={20} />
        </IconButton>
      </div>
      <WorkspaceLink
        href="/dashboard"
        className="wm-button wm-dashboard-button"
        aria-label="dashboard"
        title="dashboard"
        onClick={() => closeNav()}
      >
        <HouseIcon size={18} />
        <span>dashboard</span>
      </WorkspaceLink>
      <Button
        primary
        className="wm-compose-button"
        aria-label="compose message"
        onClick={() => {
          void compose();
          closeNav();
        }}
      >
        <PencilSimpleIcon size={18} />
        compose<span className="wm-key">C</span>
      </Button>
      <nav aria-label="mailboxes">
        {systemViews
          .filter((v) => ["inbox", "starred", "sent", "drafts", "scheduled"].includes(v))
          .map(mailboxLink)}
        <details
          className="wm-more-folders"
          open={["snoozed", "archive", "spam", "trash", "all"].includes(view)}
        >
          <summary>More folders</summary>
          {systemViews
            .filter((v) => !["inbox", "starred", "sent", "drafts", "scheduled"].includes(v))
            .map(mailboxLink)}
        </details>
        <div className="wm-nav-label">
          your spaces
          <IconButton label="manage folders and labels" onClick={() => go("settings/organization")}>
            <PlusIcon size={14} />
          </IconButton>
        </div>
        {data.resources.folders.map((f) => (
          <Link
            key={f.id}
            className={view === "folders/" + f.id ? "active" : ""}
            href={"/webmail/folders/" + f.id}
            aria-label={f.name}
            title={f.name}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-vael-thread")) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("application/x-vael-thread");
              if (/^[a-f0-9-]{36}$/.test(id))
                void runAction("move", f.id, selection.includes(id) ? selection : [id]);
            }}
            onClick={() => closeNav()}
          >
            <FolderSimpleIcon size={17} />
            <span>{f.name}</span>
          </Link>
        ))}
        {data.resources.labels.map((l) => (
          <Link
            key={l.id}
            className={view === "labels/" + l.id ? "active" : ""}
            href={"/webmail/labels/" + l.id}
            aria-label={l.name}
            title={l.name}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-vael-thread")) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("application/x-vael-thread");
              if (/^[a-f0-9-]{36}$/.test(id))
                void runAction("label", l.id, selection.includes(id) ? selection : [id]);
            }}
            onClick={() => closeNav()}
          >
            <span className={"wm-dot " + l.color} />
            <span>{l.name}</span>
          </Link>
        ))}
        {data.resources["saved-searches"].map((s) => (
          <Link
            key={s.id}
            href={"/webmail/search?q=" + encodeURIComponent(s.query)}
            aria-label={s.name}
            title={s.name}
            onClick={() => closeNav()}
          >
            <MagnifyingGlassIcon size={17} />
            <span>{s.name}</span>
          </Link>
        ))}
        {!desktop && (
          <>
            <div className="wm-nav-divider" />
            <Link
              href="/webmail/services"
              aria-label="services"
              title="services"
              onClick={() => closeNav()}
            >
              <TagIcon size={18} />
              <span>services</span>
            </Link>
            <Link
              href="/webmail/aliases"
              aria-label="aliases"
              title="aliases"
              className={view === "aliases" ? "active" : ""}
              onClick={() => closeNav()}
            >
              <TagIcon size={18} />
              <span>aliases</span>
            </Link>
            <Link
              href="/webmail/contacts"
              aria-label="contacts"
              title="contacts"
              className={view === "contacts" ? "active" : ""}
              onClick={() => closeNav()}
            >
              <UsersIcon size={18} />
              <span>contacts</span>
            </Link>
            <Link
              href="/webmail/settings/appearance"
              aria-label="settings"
              title="settings"
              className={settings ? "active" : ""}
              onClick={() => closeNav()}
            >
              <GearSixIcon size={18} />
              <span>settings</span>
            </Link>
          </>
        )}
      </nav>
      <div className="wm-account">
        <span className="wm-avatar">{(data.mailbox.address[0] ?? "").toUpperCase()}</span>
        <div>
          <strong>
            {data.resources.identities.find((i) => i.id === data.mailbox.settings.defaultIdentity)
              ?.name || data.mailbox.address.split("@")[0]}
          </strong>
          <button
            type="button"
            className="wm-copy-address"
            aria-label="copy email address"
            title="copy email address"
            onClick={() => {
              void navigator.clipboard
                .writeText(data.mailbox.address)
                .then(() => toast.success("email address copied"))
                .catch(() => toast.error("could not copy email address"));
            }}
          >
            {data.mailbox.address}
          </button>
        </div>
        {data.mailbox.plan === "free" ? (
          <WorkspaceLink
            href="/dashboard/billing"
            className="wm-badge wm-badge-upgrade"
            title="upgrade to plus for sending, custom domains and 1 gb storage"
          >
            free · upgrade ↗
          </WorkspaceLink>
        ) : (
          <span className="wm-badge">{data.mailbox.plan}</span>
        )}
      </div>
      <WorkspaceLink href="/dashboard/billing" className="wm-storage" title="manage plan & storage">
        <div>
          <span>{formatBytes(data.storage.used)}</span>
          <span>{formatBytes(data.storage.limit)}</span>
        </div>
        <progress max={data.storage.limit} value={data.storage.used} aria-label="storage used" />
      </WorkspaceLink>
    </>
  );
}
