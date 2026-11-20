import { useEffect, useState } from "react";
import { bridge } from "@/lib/bridge";
import type { AppInfo } from "@/lib/bridge/desktop";
import { Button } from "@/ui/controls";
import { BrandMark } from "@/shell/brand";
import notices from "../../../THIRD_PARTY_NOTICES.md?raw";

const links = [
  ["vaelmail.com", "https://vaelmail.com"],
  ["source code", "https://github.com/vaelmail/vaelmail-desktop"],
  ["privacy", "https://vaelmail.com/privacy"],
] as const;

export default function AboutApp() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [showNotices, setShowNotices] = useState(false);

  useEffect(() => {
    void bridge.desktop
      .info()
      .then(setInfo)
      .catch(() => undefined);
  }, []);

  return (
    <div className="vd-about">
      <div className="vd-about-brand">
        <BrandMark />
        <div>
          <h1>VaelMail</h1>
          <p>{info ? `version ${info.version}` : "version …"}</p>
        </div>
      </div>
      <p>
        privacy-first email on your desktop. everything you see here is the same service as
        vaelmail.com, with native notifications, a tray icon and an encrypted offline cache.
      </p>
      {info && (
        <dl className="vd-about-facts">
          <dt>system</dt>
          <dd>
            {info.os} · {info.arch}
          </dd>
          <dt>web view</dt>
          <dd>{info.webview || "unknown"}</dd>
          <dt>secure storage</dt>
          <dd>
            {info.dataFolder
              ? "portable, kept in the data folder"
              : info.keychain
                ? "system keychain available"
                : "unavailable"}
          </dd>
          {info.dataFolder && (
            <>
              <dt>data folder</dt>
              <dd>{info.dataFolder}</dd>
            </>
          )}
        </dl>
      )}
      <div className="vd-about-links">
        {links.map(([label, url]) => (
          <Button key={url} onClick={() => void bridge.files.openExternal(url)}>
            {label}
          </Button>
        ))}
        <Button onClick={() => setShowNotices((current) => !current)}>
          {showNotices ? "hide licenses" : "licenses"}
        </Button>
      </div>
      {showNotices && <pre className="vd-about-notices">{notices}</pre>}
    </div>
  );
}
