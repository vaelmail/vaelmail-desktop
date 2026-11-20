import {
  EyeIcon,
  FileLockIcon,
  LinkBreakIcon,
  PaperclipIcon,
  ShieldCheckIcon,
  WarningDiamondIcon,
} from "@phosphor-icons/react";
import { useMail } from "@/features/mailbox/context";
import { settingId } from "@/lib/mail/settings-registry";
import type { Settings } from "@/lib/mail/types";

const plugins = [
  {
    key: "stripTrackingLinks",
    title: "strip tracking links",
    group: "reading",
    icon: LinkBreakIcon,
    description: "Remove utm_*, fbclid, gclid and other known tracking parameters while you read.",
    details:
      "Your original email stays intact. Signed links are preserved to avoid breaking access. Cleaning parameters does not bypass tracking redirects.",
  },
  {
    key: "blockTrackingPixels",
    title: "block tracking pixels",
    group: "reading",
    icon: ShieldCheckIcon,
    description:
      "Keep identifiable tracking images blocked, even when you load other message images.",
    details:
      "Checks tiny or hidden remote images and known beacon paths. Some trackers look like ordinary images, so all remote images still need your permission.",
  },
  {
    key: "warnSuspiciousLinks",
    title: "warn about suspicious links",
    group: "reading",
    icon: WarningDiamondIcon,
    description: "Check the actual destination before opening a misleading link.",
    details:
      "Warns about mismatched visible domains and confusing internationalized hostnames. This is a local check, not a guarantee that a website is safe.",
  },
  {
    key: "stripMetadata",
    title: "strip metadata",
    group: "sending",
    icon: FileLockIcon,
    description:
      "Remove identifying file properties from supported images, PDFs and documents before sending.",
    details:
      "Supports JPEG, PNG, WebP, GIF, TIFF, AVIF, PDF, DOCX, XLSX, PPTX, ODT, ODS and ODP. Documents may lose comments and editing information. Signed, encrypted or unsupported files need an explicit choice to send their original. Visible content and filenames are not redacted.",
  },
  {
    key: "attachmentReminder",
    title: "missing attachment reminder",
    group: "sending",
    icon: PaperclipIcon,
    description: "Get a gentle reminder when you mention an attachment but haven't added one.",
    details:
      "Checks English attachment phrases in your new message, without counting quoted replies or signatures. You can always choose to send anyway.",
  },
  {
    key: "addTrackingPixel",
    title: "add tracking pixel",
    group: "sending",
    icon: EyeIcon,
    description: "Add a Vael-managed pixel to new messages and show a Seen badge in Sent.",
    details:
      "Off by default, with a separate choice in each message. One pixel per message stays active for 90 days. Only its first request time is saved. Image proxies and security scanners can trigger Seen; blocked images can hide opens. No recipient IP, location or device history is stored. Plain-text messages cannot carry a pixel.",
  },
] as const;

export function PluginsPanel() {
  const { data, setSettings } = useMail();
  return (
    <div className="wm-plugins">
      <p className="wm-plugin-intro">
        Small tools for more control over your mail. Your choices sync across devices.
      </p>
      {(["reading", "sending"] as const).map((group) => (
        <section className="wm-plugin-group" key={group} aria-labelledby={`plugins-${group}`}>
          <h2 id={`plugins-${group}`}>
            {group === "reading" ? "reading protection" : "sending tools"}
          </h2>
          {plugins
            .filter((p) => p.group === group)
            .map(({ key, title, description, details, icon: Icon }) => (
              <div className="wm-plugin-row" key={key} id={settingId(title)} tabIndex={-1}>
                <span className="wm-plugin-icon">
                  <Icon size={21} />
                </span>
                <div className="wm-plugin-copy">
                  <label htmlFor={`plugin-${key}`}>{title}</label>
                  <p id={`plugin-${key}-description`}>{description}</p>
                  <details>
                    <summary>details</summary>
                    <p>{details}</p>
                  </details>
                </div>
                <input
                  id={`plugin-${key}`}
                  className="wm-switch"
                  type="checkbox"
                  role="switch"
                  aria-label={title}
                  aria-describedby={`plugin-${key}-description`}
                  checked={data.mailbox.settings[key]}
                  onChange={(e) =>
                    void setSettings({
                      [key]: e.target.checked,
                    } as Partial<Settings>)
                  }
                />
              </div>
            ))}
        </section>
      ))}
      <p className="wm-settings-note">
        Message sanitization and isolation are always on. Plugins never bypass your image
        permissions.
      </p>
    </div>
  );
}
