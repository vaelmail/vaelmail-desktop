import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { encryptionStatus } from "@/lib/encryption/api";

export const encryptionQueryKey = ["mailbox-encryption"] as const;

type PgpCompose = {
  available: boolean;
  on: boolean;
  setOn: (value: boolean) => void;
  missing: string[];
  checking: boolean;
  encrypted: boolean | null;
};

export function usePgpCompose(recipients: string[], production: boolean): PgpCompose {
  const status = useQuery({
    queryKey: encryptionQueryKey,
    queryFn: ({ signal }) => encryptionStatus(signal),
    enabled: production,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const available = !!status.data?.pgp?.fingerprint && status.data.state !== "off";
  const key = useMemo(
    () => [...new Set(recipients.map((r) => r.toLowerCase()))].sort().join(","),
    [recipients],
  );
  const [override, setOverride] = useState<boolean | null>(null);
  const [lookup, setLookup] = useState<{ key: string; missing: string[] }>({
    key: "",
    missing: [],
  });
  useEffect(() => {
    if (!available || !key) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void import("@/lib/encryption/pgp")
        .then((m) => m.recipientKeys(key.split(",")))
        .then((found) => {
          if (!cancelled) setLookup({ key, missing: found.missing });
        })
        .catch(() => {
          if (!cancelled) setLookup({ key, missing: key.split(",") });
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [available, key]);
  const checked = lookup.key === key;
  const missing = checked && key ? lookup.missing : [];
  const allHaveKeys = !!key && checked && missing.length === 0;
  return {
    available,
    on: available && (override ?? allHaveKeys),
    setOn: setOverride,
    missing,
    checking: available && !!key && !checked,
    encrypted: !production
      ? false
      : status.data === null
        ? false
        : status.data
          ? status.data.state !== "off"
          : null,
  };
}

export function ComposerPgpToggle({ pgp, disabled }: { pgp: PgpCompose; disabled: boolean }) {
  if (!pgp.available) return null;
  return (
    <div className="wm-compose-pgp">
      <label>
        <input
          type="checkbox"
          checked={pgp.on}
          disabled={disabled}
          onChange={(e) => pgp.setOn(e.target.checked)}
        />
        <LockSimpleIcon size={14} aria-hidden />
        encrypt (OpenPGP)
      </label>
      <span role="status" className="wm-compose-pgp-status">
        {pgp.checking
          ? "checking recipient keys…"
          : pgp.missing.length
            ? "no OpenPGP key for " + pgp.missing.join(", ")
            : ""}
      </span>
      {pgp.on && (
        <span className="wm-compose-pgp-hint">
          the message and attachments are encrypted end-to-end in your browser. the subject is not
          encrypted by OpenPGP. drafts are saved to vael while you write.
        </span>
      )}
    </div>
  );
}
