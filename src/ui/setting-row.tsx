import type { ReactNode } from "react";
import { settingId } from "@/lib/mail/settings-registry";

export function SettingRow({
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

export function SwitchRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SettingRow title={title} description={description}>
      <input
        className="wm-switch"
        type="checkbox"
        role="switch"
        aria-label={title}
        checked={checked}
        disabled={disabled ?? false}
        onChange={(event) => onChange(event.target.checked)}
      />
    </SettingRow>
  );
}
