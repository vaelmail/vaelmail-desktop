import { VaelSelect } from "@/ui/select";
import { MailLink as Link } from "@/ui/controls";
import { WorkspaceLink } from "@/shell/app-link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { bridge } from "@/lib/bridge";
import { useWindowLocation } from "@/shell/window-context";
import { toast } from "sonner";
import {
  CheckIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { recovery } from "@/lib/mail/client";
import { settingsSections, type Settings } from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import { useWindowCloseGuard } from "@/shell/close-guard";
import { Button } from "@/ui/controls";
import { ResourcesPanel } from "./resources";
import { ShortcutHelp } from "./shortcut-help";
import { PluginsPanel } from "./plugins";
import { settingId, searchSettings } from "@/lib/mail/settings-registry";
import { useQuery } from "@tanstack/react-query";
import { encryptionStatus } from "@/lib/encryption/api";
import { encryptionQueryKey } from "./composer-pgp";
const descriptions: Record<string, string> = {
  appearance: "Theme, text sizing, and message density.",
  reading: "Reading layout and message view preferences.",
  compose: "Sending defaults, signatures, and draft options.",
  notifications: "Mailbox alert and notification preferences.",
  privacy: "Remote content blocking, tracking protection, and draft storage.",
  plugins: "Optional extensions for message reading and organization.",
  organization: "Folders, labels, and saved searches.",
  rules: "Automatic sorting rules and message filters.",
  addresses: "Custom addresses and receiving aliases.",
  storage: "Mailbox disk capacity and retention limits.",
  shortcuts: "Keyboard navigation and editor shortcuts.",
  session: "Browser credentials and active sessions.",
};
export function SettingsPanel({
  section,
  controlTarget,
}: {
  section: string;
  controlTarget?: string | null;
}) {
  const { data, request, refresh, setSettings, settingsSave, retrySettings } = useMail(),
    s = data.mailbox.settings;
  const routeFocus = useWindowLocation().searchParams.get("control");
  const root = useRef<HTMLDivElement>(null);
  const focus = controlTarget === undefined ? routeFocus : controlTarget;
  useWindowCloseGuard(() => {
    if (settingsSave.status === "saving" || settingsSave.status === "failed")
      throw new Error(
        "Finish saving your preferences before closing Settings. Use Retry if a save failed.",
      );
  });
  useEffect(() => {
    if (!focus) return;
    const row = root.current?.querySelector<HTMLElement>("#" + CSS.escape(focus));
    if (row) {
      row.scrollIntoView({ block: "center" });
      (
        row.querySelector<HTMLElement>(".vael-select") ||
        row.querySelector<HTMLElement>("input,select,textarea,button,a") ||
        row
      ).focus({ preventScroll: true });
    }
  }, [focus, section]);
  const [timeStatus, setTimeStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle"),
    [timeError, setTimeError] = useState("");
  const [query, setQuery] = useState(""),
    [timezone, setTimezone] = useState(data.mailbox.timezone);
  const current = settingsSections.find(([id]) => id === section) || settingsSections[0];
  const save = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    void setSettings({ [key]: value });
  const toggle = (key: keyof Settings, title: string, description: string) => (
    <SettingRow title={title} description={description}>
      <input
        className="wm-switch"
        type="checkbox"
        role="switch"
        aria-label={title}
        checked={!!s[key]}
        onChange={(e) => save(key, e.target.checked as never)}
      />
    </SettingRow>
  );
  const select = <K extends keyof Settings>(
    key: K,
    title: string,
    description: string,
    options: [Settings[K], string][],
  ) => (
    <SettingRow title={title} description={description}>
      <VaelSelect
        aria-label={title}
        value={String(s[key])}
        onChange={(e) => {
          const option = options.find(([value]) => String(value) === e.target.value);
          if (option) save(key, option[0]);
        }}
      >
        {options.map(([value, label]) => (
          <option value={String(value)} key={String(value)}>
            {label}
          </option>
        ))}
      </VaelSelect>
    </SettingRow>
  );
  const blocks: Record<string, ReactNode> = {
    appearance: (
      <>
        {select("theme", "color theme", "soft contrast, in every light.", [
          ["dark", "dark"],
          ["light", "light"],
          ["system", "follow device"],
        ])}
        <div className="wm-theme-preview" role="group" aria-label="theme previews">
          {(["dark", "light"] as const).map((theme) => (
            <button
              type="button"
              key={theme}
              className={theme}
              aria-pressed={s.theme === theme}
              onClick={() => save("theme", theme as never)}
            >
              <span className="wm-theme-window" aria-hidden="true">
                <span className="wm-theme-caption">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="wm-theme-body">
                  <span className="wm-theme-line" />
                  <span className="wm-theme-line short" />
                  <span className="wm-theme-chip" />
                </span>
              </span>
              <span className="wm-theme-name">
                {theme === "dark" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
                {theme}
              </span>
            </button>
          ))}
        </div>
        {select("density", "inbox density", "make room, or see a little more.", [
          ["comfortable", "comfortable"],
          ["compact", "compact"],
        ])}
        {select("reader", "reading pane", "split keeps your list nearby on larger screens.", [
          ["split", "split view"],
          ["full", "full width"],
        ])}
        {select("bodySize", "message text size", "change the size of message content.", [
          [14, "small · 14px"],
          [16, "standard · 16px"],
          [18, "large · 18px"],
        ])}
      </>
    ),
    reading: (
      <>
        {toggle(
          "markRead",
          "mark as read on open",
          "turn this off to manage read status yourself.",
        )}
        {toggle("grouping", "group conversations", "keep replies in one conversation in the list.")}
        {select("sort", "default order", "choose which messages greet you first.", [
          ["newest", "newest first"],
          ["oldest", "oldest first"],
        ])}
        {select("afterAction", "after moving a conversation", "choose where reading continues.", [
          ["next", "open the next conversation"],
          ["list", "return to the list"],
        ])}
      </>
    ),
    compose: (
      <>
        {select(
          "defaultIdentity",
          "default sending identity",
          "your starting address for new messages.",
          data.resources.identities.map((i) => [i.id, i.email]),
        )}
        {toggle("plainText", "start in plain text", "you can switch format in any composer.")}
        {select("undoSeconds", "undo send window", "sending waits on the server for this long.", [
          [0, "send immediately"],
          [5, "5 seconds"],
          [10, "10 seconds"],
          [20, "20 seconds"],
          [30, "30 seconds"],
        ])}
        <SettingRow title="time zone" description="used for mailbox dates and scheduled mail.">
          <form
            className="wm-row"
            onSubmit={(e) => {
              e.preventDefault();
              setTimeStatus("saving");
              setTimeError("");
              void request("timezone", "PATCH", { timezone })
                .then(refresh)
                .then(() => {
                  setTimeStatus("saved");
                  toast.success("time zone saved");
                })
                .catch((e) => {
                  setTimeStatus("failed");
                  setTimeError(e.message);
                });
            }}
          >
            <input
              aria-label="mailbox time zone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Berlin"
              list="mailbox-timezones"
            />
            <datalist id="mailbox-timezones">
              {["UTC", ...Intl.supportedValuesOf("timeZone")].map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <Button type="submit" busy={timeStatus === "saving"}>
              {timeStatus === "failed" ? "retry" : "save"}
            </Button>
            <span role={timeStatus === "failed" ? "alert" : "status"}>
              {timeStatus === "failed" ? timeError : timeStatus === "idle" ? "" : timeStatus}
            </span>
          </form>
        </SettingRow>
        <div id={settingId("sending identities")} tabIndex={-1}>
          <ResourcesPanel collection="identities" embedded />
        </div>
      </>
    ),
    notifications: (
      <>
        {toggle(
          "inAppNotifications",
          "mail activity in the app",
          "hear when queued messages send or snoozed mail returns.",
        )}
        <SettingRow
          title="desktop notifications"
          description="a system permission is requested only when you enable this."
        >
          <input
            className="wm-switch"
            type="checkbox"
            role="switch"
            aria-label="desktop notifications"
            checked={s.desktopNotifications}
            onChange={async (e) => {
              if (!e.target.checked) {
                await setSettings({ desktopNotifications: false });
                return;
              }
              const permission = await bridge.desktop.requestNotificationPermission();
              if (permission === "denied") {
                toast.info("notifications are blocked in your system settings");
                return;
              }
              await setSettings({ desktopNotifications: true });
            }}
          />
        </SettingRow>
        <p className="wm-settings-note">
          scheduled messages and snoozed mail are handled by the server while you are away.
        </p>
      </>
    ),
    plugins: <PluginsPanel />,
    privacy: (
      <>
        {toggle(
          "localRecovery",
          "save draft recovery on this device",
          "off by default. enabling this stores unsaved message content in this browser. local copies are cleared on sign-out, lock, panic lock or account deletion, and are never kept while your mailbox is encrypted.",
        )}
        <SettingRow
          title="local draft recovery"
          description="clear recovery copies saved on this device. saved mailbox drafts are kept."
        >
          <Button
            onClick={() => {
              void recovery.drafts
                .where("mailboxId")
                .equals(data.mailbox.id)
                .delete()
                .then(() => toast.success("local recovery copies cleared"));
            }}
          >
            clear local copies
          </Button>
        </SettingRow>
        {toggle(
          "favicons",
          "website icons",
          "fetch domain-level favicons through vael. turn off to use local icons only. message images stay separate.",
        )}
        {select(
          "images",
          "message images",
          "images stay blocked until you allow them for a message. remote images load through vael and may reveal an open.",
          [
            ["block", "always block"],
            ["ask", "ask before loading"],
          ],
        )}
        <SettingRow
          title="message isolation"
          description="sender html and css are sanitized and isolated. scripts, forms, external stylesheets and web fonts stay blocked."
        >
          <span className="wm-badge enabled">always on</span>
        </SettingRow>
        <SettingRow
          title="tracking protection"
          description="message images make no requests before permission. allowed remote images load through vael without your cookies, referrer or browser IP."
        >
          <span className="wm-badge enabled">protected</span>
        </SettingRow>
        {<EncryptionNote />}
      </>
    ),
    organization: (
      <>
        <div id={settingId("folders")} tabIndex={-1}>
          <ResourcesPanel collection="folders" embedded />
        </div>
        <div id={settingId("labels")} tabIndex={-1}>
          <ResourcesPanel collection="labels" embedded />
        </div>
        <div id={settingId("saved searches")} tabIndex={-1}>
          <ResourcesPanel collection="saved-searches" embedded />
        </div>
      </>
    ),
    rules: (
      <div id={settingId("rules")} tabIndex={-1}>
        <ResourcesPanel collection="rules" embedded />
      </div>
    ),
    shortcuts: (
      <>
        {toggle(
          "shortcuts",
          "keyboard shortcuts",
          "single key shortcuts are paused while you type.",
        )}
        <ShortcutHelp />
      </>
    ),
  };
  return (
    <div className="wm-settings" ref={root} data-settings-page={current[0]}>
      <aside className="wm-settings-nav" aria-label="settings navigation">
        <div>
          <GearSixIcon size={22} />
          <h1>settings</h1>
        </div>
        <label className="wm-settings-search">
          <MagnifyingGlassIcon size={16} />
          <input
            aria-label="search settings"
            placeholder="find a setting"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <nav aria-label="settings categories">
          {query.trim() && !searchSettings(query).length && (
            <p role="status" className="wm-muted">
              no matching controls
            </p>
          )}
          {query.trim()
            ? searchSettings(query).map((control) => {
                const ControlLink = control.destination?.startsWith("/dashboard")
                  ? WorkspaceLink
                  : Link;
                return (
                  <ControlLink
                    key={control.title}
                    href={
                      (control.destination || "/webmail/settings/" + control.section) +
                      "?control=" +
                      settingId(control.title)
                    }
                    onClick={() => setQuery("")}
                  >
                    <strong>{control.title}</strong>
                    <small>{control.description}</small>
                  </ControlLink>
                );
              })
            : settingsSections.map(([id, label]) => (
                <Link
                  key={id}
                  href={"/webmail/settings/" + id}
                  className={current[0] === id ? "active" : ""}
                >
                  {label}
                </Link>
              ))}
          <WorkspaceLink href="/dashboard" className="wm-settings-account-link">
            account dashboard
          </WorkspaceLink>
        </nav>
      </aside>
      <section className="wm-settings-content">
        <div className="wm-page-heading">
          <div>
            <h1>{current[1]}</h1>
            <p className="wm-muted">{descriptions[current[0]]}</p>
          </div>
          <span className="wm-autosaved" role="status">
            {settingsSave.status === "saved" && <CheckIcon size={13} />}
            {settingsSave.status === "idle"
              ? "settings loaded"
              : settingsSave.status === "failed"
                ? "changes not saved"
                : settingsSave.status}
          </span>
        </div>
        {settingsSave.status === "failed" && (
          <div className="wm-settings-save-error" role="alert">
            <p>{settingsSave.error || "could not save your changes"}</p>
            <Button onClick={() => void retrySettings()}>retry saving</Button>
          </div>
        )}
        <div className="wm-settings-body">{blocks[current[0]]}</div>
      </section>
    </div>
  );
}
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="wm-setting-row" id={settingId(title)} tabIndex={-1}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="wm-setting-control">{children}</div>
    </div>
  );
}
function EncryptionNote() {
  const status = useQuery({
    queryKey: encryptionQueryKey,
    queryFn: ({ signal }) => encryptionStatus(signal),
    retry: false,
    staleTime: 60000,
  });
  const s = status.data;
  if (s && s.state === "disabling")
    return (
      <p className="wm-settings-note">
        the encrypted mailbox is being turned off: your mail is being stored readable by our servers
        again, like most email. the running server and its operators will be able to read it.
        ordinary external email is not end-to-end encrypted.
      </p>
    );
  if (s && s.state !== "off")
    return (
      <p className="wm-settings-note">
        your stored mail and backups are stored encrypted with a key only you hold
        {s.state === "migrating" ? " (existing mail is still being encrypted)" : ""}. our server
        still sees mail as it arrives, and decrypts it in memory to show it while you are unlocked.
        OpenPGP messages in this webmail are end-to-end: encrypted and decrypted in your browser
        only. other external email is not end-to-end encrypted.
      </p>
    );
  return (
    <p className="wm-settings-note">
      mail and backups are encrypted at rest. the running server and its operators can read mail.
      ordinary external email is not end-to-end encrypted.
      {s && (
        <>
          {" "}
          you can turn on an{" "}
          <WorkspaceLink href="/dashboard/security?control=setting-mailbox-encryption">
            encrypted mailbox
          </WorkspaceLink>{" "}
          so stored mail needs a key only you hold.
        </>
      )}
    </p>
  );
}
