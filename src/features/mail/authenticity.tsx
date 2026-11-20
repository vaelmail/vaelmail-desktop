import { SealCheckIcon, SealQuestionIcon, SealWarningIcon } from "@phosphor-icons/react";
import type { Authenticity } from "@/lib/mail/types";

const label: Record<Authenticity["verdict"], string> = {
  verified: "verified sender",
  unverified: "unverified sender",
  spoofed: "possibly spoofed",
};

const sourceCopy: Record<Authenticity["source"], string> = {
  vael: "checked by VaelMail when the message arrived",
  legacy: "checked by the old reca.st server when the message arrived",
  internal: "sent through VaelMail by a signed-in account",
  own: "sent from this account",
  none: "no sender checks were recorded for this message",
};

export function AuthenticityBadge({ authenticity: a }: { authenticity?: Authenticity }) {
  if (!a || a.source === "own") return null;
  const Icon =
    a.verdict === "verified"
      ? SealCheckIcon
      : a.verdict === "spoofed"
        ? SealWarningIcon
        : SealQuestionIcon;
  const warned = a.warnings.length > 0;
  return (
    <details className={"wm-auth " + a.verdict + (warned ? " warned" : "")}>
      <summary>
        <Icon size={14} weight={a.verdict === "spoofed" ? "fill" : "regular"} aria-hidden />
        <span className="wm-auth-label">{label[a.verdict]}</span>
        {warned && (
          <span className="wm-auth-warned">
            · {a.warnings.length === 1 ? "1 warning" : a.warnings.length + " warnings"}
          </span>
        )}
      </summary>
      <div className="wm-auth-details">
        {a.reasons.length > 0 && (
          <ul aria-label="reasons">
            {a.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {warned && (
          <ul aria-label="warnings" className="wm-auth-warnings">
            {a.warnings.map((w) => (
              <li key={w}>warning: {w}</li>
            ))}
          </ul>
        )}
        {a.source === "vael" || a.source === "legacy" ? (
          <dl>
            <dt>SPF</dt>
            <dd>
              {a.spf || "none"}
              {a.spfDomain ? " (" + a.spfDomain + ")" : ""}
            </dd>
            <dt>DKIM</dt>
            <dd>
              {a.dkim.length
                ? a.dkim.map((d) => d.result + (d.domain ? " (" + d.domain + ")" : "")).join(", ")
                : "none"}
            </dd>
            <dt>DMARC</dt>
            <dd>
              {a.dmarc || "none"}
              {a.dmarcPolicy ? " (policy " + a.dmarcPolicy + ")" : ""}
            </dd>
          </dl>
        ) : null}
        <p className="wm-auth-source">{sourceCopy[a.source]}</p>
      </div>
    </details>
  );
}
