import { Popover } from "@base-ui/react/popover";
import { CopyButton } from "./ui";
import { VaelSelect } from "@/ui/select";
import { saveOpenDrafts } from "@/lib/workspace-navigation";
import { resetMailboxLock } from "@/lib/encryption/lock-state";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppLink as NextLink } from "@/shell/app-link";
import dynamic from "@/ui/dynamic";
import { useSession } from "@/app/session";
import { useQuery } from "@tanstack/react-query";
import {
  CaretDownIcon,
  UserCircleIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CreditCardIcon,
  DatabaseIcon,
  EnvelopeIcon,
  HouseIcon,
  ListIcon,
  ShieldCheckIcon,
  ListChecksIcon,
  TagIcon,
  ArrowRightIcon,
  SignOutIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import { Brand } from "@/shell/brand";
import { WorkspaceLink } from "@/shell/app-link";
import { useMail } from "@/features/mailbox/context";
import { OverlayClassContext, Button, Confirm, Failure, Sheet, Skeleton } from "@/ui/controls";
import { ApiError, wipeDraftRecovery } from "@/lib/mail/client";
import { useWorkspace } from "@/features/mail/workspace";
import { formatBytes } from "@/lib/mail/types";
import type { AccountActionResult, AccountSnapshot } from "@/lib/account";
import { AccountContext, useAccount, dateLabel } from "./context";
const ProductionSecurity = dynamic(
  () => import("./production-security").then((m) => m.ProductionSecurity),
  { loading: () => <Skeleton variant="panel" /> },
);
const ProductionBilling = dynamic(
  () => import("./production-billing").then((m) => m.ProductionBilling),
  { loading: () => <Skeleton variant="panel" /> },
);
const ProductionData = dynamic(() => import("./production-data").then((m) => m.ProductionData), {
  loading: () => <Skeleton variant="panel" />,
});
const SecurityCheckupCard = dynamic(
  () => import("./security-checkup").then((m) => m.SecurityCheckupCard),
  { loading: () => <Skeleton variant="panel" /> },
);
const SecurityCheckup = dynamic(() => import("./security-checkup").then((m) => m.SecurityCheckup), {
  loading: () => <Skeleton variant="panel" />,
});
const ResourcesPanel = dynamic(
  () => import("@/features/mail/resources").then((m) => m.ResourcesPanel),
  { loading: () => <Skeleton /> },
);
const sections = [
  ["overview", "overview", HouseIcon],
  ["billing", "plus & billing", CreditCardIcon],
  ["storage", "storage", DatabaseIcon],
  ["addresses", "addresses", TagIcon],
  ["security", "security", ShieldCheckIcon],
  ["checkup", "security checkup", ListChecksIcon],
  ["data", "your data", DownloadSimpleIcon],
] as const;
const subscribeNavigation = () => () => {};
const descriptions: Record<string, string> = {
  overview: "Account status and recent activity.",
  billing: "Plan details, payment invoices, and prepaid term.",
  storage: "Mailbox storage quota and usage breakdown.",
  addresses: "Custom addresses and receiving aliases.",
  security: "Authentication credentials, WebAuthn passkeys, and active sessions.",
  data: "Data exports and account lifecycle management.",
  checkup: "A checklist of how your account is protected, with fixes.",
};
export function Dashboard({
  children,
  initial,
  location,
}: {
  children?: ReactNode;
  initial: AccountSnapshot;
  location?: string;
}) {
  const { data, request, refresh, setSettings, settingsSave, retrySettings } = useMail();
  const localURL = useMemo(
    () => new URL(location || "/dashboard/overview", "https://desktop.invalid"),
    [location],
  );
  const search = localURL.searchParams;
  const section = localURL.pathname.replace(/^\/dashboard\/?/, "") || "overview";
  const current = section.split("/")[0];
  const mainId = useId();
  const q = useQuery({
    queryKey: ["account", data.mailbox.id, data.mailbox.generation],
    initialData: initial,
    queryFn: () => request<AccountSnapshot>("/api/account"),
  });
  const [nav, setNav] = useState(false),
    [busy, setBusy] = useState(false);
  const returnHref = useSyncExternalStore(
    subscribeNavigation,
    useCallback(() => {
      try {
        const previous = sessionStorage.getItem("vael-previous-mail:" + data.mailbox.id);
        if (previous?.startsWith("/webmail/") && !previous.startsWith("/webmail/settings"))
          return previous;
      } catch {}
      return "/webmail/inbox";
    }, [data.mailbox.id]),
    () => "/webmail/inbox",
  );
  const heading = useRef<HTMLHeadingElement>(null),
    main = useRef<HTMLElement>(null),
    lastSection = useRef(section);
  useEffect(() => {
    if (lastSection.current !== section) {
      main.current?.scrollTo({ top: 0 });
      heading.current?.focus({ preventScroll: true });
      lastSection.current = section;
    }
    const control = search.get("control");
    const container = main.current;
    if (!control || !container) return;
    const reveal = () => {
      const row = container.querySelector<HTMLElement>("#" + CSS.escape(control));
      if (!row) return false;
      row.scrollIntoView({ block: "center" });
      row.focus({ preventScroll: true });
      return true;
    };
    if (reveal()) return;
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [section, search]);
  const action = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const result = await request<AccountActionResult>("/api/account", "POST", {
        ...(body.type === "purchase" ? {} : { revision: q.data.revision }),
        ...body,
      });
      await refresh();
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await refresh();
      throw error;
    } finally {
      setBusy(false);
    }
  };
  const leave = async (deleteAccount: boolean) => {
    if (!deleteAccount) await saveOpenDrafts();
    await request("/api/session", "DELETE");
    await wipeDraftRecovery();
    resetMailboxLock();
    useWorkspace.setState({
      composers: [],
      minimized: [],
      maximized: null,
      command: false,
      draftNames: {},
    });
    try {
      sessionStorage.removeItem("vael-previous-mail:" + data.mailbox.id);
    } catch {}
    void useSession.getState().signOut();
  };
  const navigation = (
    <nav aria-label="account sections">
      {sections.map(([id, label, Icon]) => (
        <NextLink
          key={id}
          href={id === "overview" ? "/dashboard" : "/dashboard/" + id}
          className={current === id ? "active" : ""}
          aria-current={current === id ? "page" : undefined}
          onClick={() => setNav(false)}
        >
          <Icon size={18} weight="regular" aria-hidden />
          <span>{label}</span>
        </NextLink>
      ))}
    </nav>
  );
  const accountMenu = (
    <div className="da-account-menu-content">
      <div className="da-menu-identity">
        <code translate="no">{data.mailbox.address}</code>
        <CopyButton value={data.mailbox.address} label="copy address" />
      </div>
      <label className="da-theme-field">
        appearance
        <VaelSelect
          aria-label="account color theme"
          value={data.mailbox.settings.theme}
          onChange={(e) =>
            void setSettings({
              theme: e.target.value as "dark" | "light" | "system",
            }).catch(() => {})
          }
        >
          <option value="dark">dark</option>
          <option value="light">light</option>
          <option value="system">system</option>
        </VaelSelect>
      </label>
      <WorkspaceLink href="/webmail/settings/appearance" className="da-menu-link">
        mail preferences <ArrowUpRightIcon size={16} aria-hidden />
      </WorkspaceLink>
      <Confirm
        title="sign out of your account?"
        description="this device's access will end. sign in again with your saved account number."
        trigger={(open) => (
          <button type="button" className="da-menu-link da-signout" onClick={open}>
            <span>sign out</span>
            <SignOutIcon size={16} aria-hidden />
          </button>
        )}
        action={() => leave(false)}
      />
    </div>
  );
  return (
    <AccountContext.Provider value={{ account: q.data, busy, action }}>
      <OverlayClassContext.Provider value="da-overlay">
        <div className="wm da" data-account-page={current}>
          <a className="skip-link" href={"#" + mainId}>
            skip to account
          </a>
          <header className="da-header">
            <div className="da-header-brand">
              <Brand href="/" />
              <span className="da-header-divider" />
              <span className="da-header-label">account</span>
            </div>
            <div className="da-header-actions">
              <WorkspaceLink href={returnHref} className="wm-button" aria-label="return to mail">
                <EnvelopeIcon size={17} aria-hidden />
                <span>return to mail</span>
              </WorkspaceLink>
              <Popover.Root>
                <Popover.Trigger aria-label="account" className="wm-button da-account-trigger">
                  <UserCircleIcon size={20} aria-hidden />
                  <span>account</span>
                  <CaretDownIcon size={12} aria-hidden />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner sideOffset={10} align="end">
                    <Popover.Popup className="wm-menu da-account-menu">{accountMenu}</Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </header>
          <section className="da-topnav" aria-label="account navigation">
            <div className="da-topnav-inner">
              {navigation}
              <button
                type="button"
                className="da-mobile-section"
                onClick={() => setNav(true)}
                aria-label="open account navigation"
              >
                <ListIcon size={18} aria-hidden />
                <span>{sections.find(([id]) => id === current)?.[1]}</span>
                <CaretDownIcon size={14} aria-hidden />
              </button>
              <span className="da-nav-plan">vael {q.data.plan}</span>
            </div>
          </section>
          <Sheet open={nav} onClose={() => setNav(false)} title="your account">
            <div className="da-mobile-nav">{navigation}</div>
          </Sheet>
          <main ref={main} id={mainId} className="da-main" aria-busy={q.isFetching}>
            <div className="da-content">
              <div className="da-page-heading">
                <h1 ref={heading} tabIndex={-1}>
                  {sections.find(([id]) => id === current)?.[1]}
                </h1>
                <p>{current ? descriptions[current] : null}</p>
              </div>
              {settingsSave.status === "failed" && (
                <div className="da-notice" role="alert">
                  {settingsSave.error || "your preference could not be saved."}{" "}
                  <Button onClick={() => void retrySettings().catch(() => {})}>retry saving</Button>
                </div>
              )}
              {q.error && q.data && (
                <div className="da-notice" role="alert">
                  Could not refresh your account. Showing the last loaded information.{" "}
                  <Button onClick={() => void q.refetch()}>retry</Button>
                </div>
              )}
              {q.error && !q.data ? (
                <Failure error={q.error} retry={() => void q.refetch()} />
              ) : (
                <>
                  {current === "overview" && <Overview />}
                  {current === "billing" && <ProductionBilling />}
                  {current === "storage" && <Storage />}
                  {current === "addresses" && (
                    <>
                      <div className="da-address-summary" id="setting-main-address" tabIndex={-1}>
                        <code translate="no">{data.mailbox.address}</code>
                        <CopyButton value={data.mailbox.address} label="copy address" />
                        <span className="wm-badge">
                          receive{data.capabilities.send ? " & send" : " only"}
                        </span>
                      </div>
                      <nav className="da-tabs" aria-label="address categories">
                        <NextLink
                          href="/dashboard/addresses"
                          aria-current={section === "addresses" ? "page" : undefined}
                        >
                          aliases <span>{data.resources.aliases.length}</span>
                        </NextLink>
                        <NextLink
                          href="/dashboard/addresses/domains"
                          aria-current={section.endsWith("domains") ? "page" : undefined}
                        >
                          custom domains <span>{data.resources.domains.length}</span>
                        </NextLink>
                      </nav>
                      {section.endsWith("domains") && !data.capabilities.domains && (
                        <p className="da-notice">
                          custom domains need plus. your existing domains are kept.{" "}
                          <NextLink href="/dashboard/billing">explore plus ↗</NextLink>
                        </p>
                      )}
                      <div
                        id={
                          section.endsWith("domains") ? "setting-custom-domains" : "setting-aliases"
                        }
                        tabIndex={-1}
                      >
                        <ResourcesPanel
                          key={section}
                          collection={section.endsWith("domains") ? "domains" : "aliases"}
                          embedded
                        />
                      </div>
                    </>
                  )}
                  {current === "security" && <ProductionSecurity />}
                  {current === "checkup" && <SecurityCheckup />}
                  {current === "data" && <ProductionData />}
                </>
              )}
              {children}
              <footer className="da-footnote">your mailbox. your account. your choice.</footer>
            </div>
          </main>
        </div>
      </OverlayClassContext.Provider>
    </AccountContext.Provider>
  );
}
function Overview() {
  const { account } = useAccount();
  const { data } = useMail();
  const recoveryLow = account.security.twoFactor && account.security.recoveryCount < 3;
  return (
    <>
      <div className="da-identity">
        <div>
          <h2 translate="no">{account.address}</h2>
          <span className="da-muted">account created {dateLabel(account.createdAt)}</span>
        </div>
        <div className="da-identity-actions">
          <span className="da-status">
            <CheckCircleIcon size={16} aria-hidden />
            active
          </span>
          <CopyButton value={account.address} label="copy address" />
        </div>
      </div>
      <div className="da-overview-grid">
        <section className="da-card da-plan-card">
          <div className="da-card-title">
            <h2>vael {account.plan}</h2>
            <span className="wm-badge">{account.plan === "plus" ? "prepaid" : "free"}</span>
          </div>
          <p>
            {account.plan === "plus"
              ? "sending, more storage and your own domains."
              : "receive-only email. no subscription needed."}
          </p>
          <div className="da-plan-meta">
            <span>{account.plan === "plus" ? "paid access ends" : "storage included"}</span>
            <strong>
              {account.plan === "plus"
                ? dateLabel(account.plusExpiresAt)
                : formatBytes(account.storage.limit)}
            </strong>
          </div>
          <NextLink className="da-text-link" href="/dashboard/billing">
            {account.plan === "plus" ? "manage plus" : "explore plus"}
            <ArrowRightIcon size={16} aria-hidden />
          </NextLink>
        </section>
        <SecurityCheckupCard />
        <Storage compact />
      </div>
      {(!account.security.twoFactor || recoveryLow || !data.resources.aliases.length) && (
        <section className="da-section da-next-steps">
          <div className="da-section-heading">
            <h2>next steps</h2>
            <span className="da-muted">a few useful things to set up</span>
          </div>
          {!account.security.twoFactor && (
            <NextLink
              className="da-task-row"
              href="/dashboard/security?control=setting-two-factor-authentication"
            >
              <span className="da-task-icon">
                <ShieldCheckIcon size={20} aria-hidden />
              </span>
              <div>
                <h3>protect your sign-in</h3>
                <p>set up two-factor authentication and save your recovery codes.</p>
              </div>
              <ArrowRightIcon size={18} aria-hidden />
            </NextLink>
          )}
          {recoveryLow && (
            <NextLink
              className="da-task-row"
              href="/dashboard/security?control=setting-recovery-codes"
            >
              <span className="da-task-icon">
                <ShieldCheckIcon size={20} aria-hidden />
              </span>
              <div>
                <h3>replace your recovery codes</h3>
                <p>{account.security.recoveryCount} left. save a new set before you need it.</p>
              </div>
              <ArrowRightIcon size={18} aria-hidden />
            </NextLink>
          )}
          {!data.resources.aliases.length && (
            <NextLink className="da-task-row" href="/dashboard/addresses">
              <span className="da-task-icon">
                <TagIcon size={20} aria-hidden />
              </span>
              <div>
                <h3>
                  try an alias <span className="wm-badge">optional</span>
                </h3>
                <p>keep your main address private when signing up elsewhere.</p>
              </div>
              <ArrowRightIcon size={18} aria-hidden />
            </NextLink>
          )}
        </section>
      )}
      <section className="da-section">
        <div className="da-section-heading">
          <h2>account shortcuts</h2>
        </div>
        <div className="da-shortcuts">
          <NextLink href="/dashboard/addresses">
            manage addresses
            <ArrowUpRightIcon size={17} aria-hidden />
          </NextLink>
          <NextLink href="/dashboard/security?control=setting-mail-apps">
            connect a mail app
            <ArrowUpRightIcon size={17} aria-hidden />
          </NextLink>
          <NextLink href="/dashboard/data">
            export your data
            <ArrowUpRightIcon size={17} aria-hidden />
          </NextLink>
        </div>
      </section>
      {account.activity.length > 0 && (
        <section className="da-section">
          <div className="da-section-heading">
            <h2>recent account activity</h2>
          </div>
          <Activity limit={4} />
        </section>
      )}
    </>
  );
}
function Activity({ limit = 12 }: { limit?: number }) {
  const { account } = useAccount();
  return account.activity.length ? (
    <ul className="da-activity">
      {account.activity.slice(0, limit).map((event) => (
        <li key={event.id}>
          <span>{event.title}</span>
          <time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time>
        </li>
      ))}
    </ul>
  ) : (
    <p className="da-muted">your account actions will appear here.</p>
  );
}
function Storage({ compact = false }: { compact?: boolean }) {
  const { account } = useAccount();
  const storage = account.storage,
    percentage = storage.limit > 0 ? (storage.used / storage.limit) * 100 : 0;
  const rows = [
    ["messages", storage.messages],
    ["saved drafts", storage.drafts],
    ["attachments", storage.attachments],
    ["imported source files", storage.sources],
  ] as const;
  const attachmentGroups: Record<string, number> = {};
  for (const [type, bytes] of Object.entries(storage.attachmentTypes || {})) {
    const group = type.startsWith("image/")
      ? "Images"
      : type.startsWith("audio/")
        ? "Audio"
        : type.startsWith("video/")
          ? "Video"
          : /pdf|document|text\/|sheet|presentation|officedocument/.test(type)
            ? "Documents"
            : "Other files";
    attachmentGroups[group] = (attachmentGroups[group] || 0) + bytes;
  }
  return (
    <section
      className={compact ? "da-card da-storage-card" : "da-storage-page da-panel"}
      id="setting-storage-plan"
      tabIndex={-1}
    >
      <div className="da-section-heading">
        <h2>{compact ? "storage" : "storage usage"}</h2>
        {compact && (
          <NextLink className="da-text-link" href="/dashboard/storage">
            view storage <ArrowUpRightIcon size={15} aria-hidden />
          </NextLink>
        )}
      </div>
      {!compact && (
        <p className="da-muted">
          mail, saved drafts, attachments and pending outgoing copies count toward your storage.
        </p>
      )}
      <div className="da-storage-total">
        <strong>{formatBytes(storage.used)}</strong>
        <span>of {formatBytes(storage.limit)} used</span>
        <span className="da-storage-percent">
          {percentage < 0.1 && percentage > 0 ? "< 0.1" : percentage.toFixed(1)}%
        </span>
      </div>
      <progress
        value={Math.min(storage.used, storage.limit)}
        max={Math.max(1, storage.limit)}
        aria-label="account storage used"
        aria-valuetext={`${formatBytes(storage.used)} of ${formatBytes(storage.limit)} used`}
      />
      {percentage >= 80 && (
        <p className="da-notice" role="status">
          {percentage >= 100
            ? "you're at or above your storage limit. remove some mail or extend plus to save new content."
            : "your storage is nearly full. make room or explore plus."}{" "}
          <NextLink href="/dashboard/billing">manage plan ↗</NextLink>
        </p>
      )}
      <p className="da-muted da-storage-remaining">
        {formatBytes(Math.max(0, storage.limit - storage.used))} available
      </p>
      {!compact && (
        <>
          {storage.breakdownAvailable && (
            <div className="da-storage-breakdown">
              {rows.map(([label, bytes]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{formatBytes(bytes)}</strong>
                </div>
              ))}
            </div>
          )}
          {storage.breakdownAvailable && Object.keys(attachmentGroups).length > 0 && (
            <section className="da-attachment-storage" aria-label="Attachment content types">
              <h3>Inside attachments</h3>
              <div className="da-storage-breakdown">
                {Object.entries(attachmentGroups)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, bytes]) => (
                    <div key={type}>
                      <span>{type}</span>
                      <strong>{formatBytes(bytes)}</strong>
                    </div>
                  ))}
              </div>
              <details>
                <summary>File type details</summary>
                <div className="da-storage-breakdown">
                  {Object.entries(storage.attachmentTypes || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, bytes]) => (
                      <div key={type}>
                        <span>{type}</span>
                        <strong>{formatBytes(bytes)}</strong>
                      </div>
                    ))}
                </div>
              </details>
            </section>
          )}
          <p className="da-muted da-storage-explanation">
            {storage.breakdownAvailable
              ? "Attachment sizes are MIME payload estimates. Messages include headers, encoding and other mailbox overhead. Draft attachments are included in saved drafts. The breakdown refreshes in the background."
              : "Your mailbox total is measured directly. The content breakdown is being prepared in the background."}
          </p>
          <div className="da-inline-actions">
            <WorkspaceLink className="wm-button" href="/webmail/trash">
              review trash
            </WorkspaceLink>
            <WorkspaceLink className="wm-button" href="/webmail/search?q=has%3Aattachment">
              find attachments
            </WorkspaceLink>
            <NextLink className="wm-button" href="/dashboard/billing">
              {account.plan === "plus" ? "manage plus" : "get 1 gb with plus"}
            </NextLink>
          </div>
        </>
      )}
    </section>
  );
}
