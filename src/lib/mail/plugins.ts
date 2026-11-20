import { getDomain } from "tldts";

const trackingNames = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
  "vero_id",
  "vero_conv",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
]);
const signedName = /^(?:signature|sig|hmac|x-amz-.+|x-goog-.+|key-pair-id|policy)$/i;
export function stripTrackingParameters(href: string) {
  try {
    const u = new URL(href);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return href;
  } catch {
    return href;
  }
  const hashAt = href.indexOf("#"),
    end = hashAt < 0 ? href.length : hashAt;
  const question = href.indexOf("?");
  if (question < 0 || question > end) return href;
  const parts = href.slice(question + 1, end).split("&");
  const names = parts.map((p) => {
    try {
      return decodeURIComponent((p.split("=")[0] ?? "").replace(/\+/g, " ")).toLowerCase();
    } catch {
      return "";
    }
  });
  if (names.some((n) => signedName.test(n))) return href;
  const kept = parts.filter(
    (_, i) => !(names[i] ?? "").startsWith("utm_") && !trackingNames.has(names[i] ?? ""),
  );
  if (kept.length === parts.length) return href;
  return href.slice(0, question) + (kept.length ? "?" + kept.join("&") : "") + href.slice(end);
}
export function safeWebLink(value: string) {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && value.length <= 8192
      ? u
      : null;
  } catch {
    return null;
  }
}
export function suspiciousLink(href: string, label: string): string | null {
  const u = safeWebLink(href);
  if (!u) return "this link has an invalid destination";
  if (u.hostname.split(".").some((part) => part.startsWith("xn--")))
    return "the destination uses an internationalized domain; check its spelling carefully";
  const visible = label
    .trim()
    .match(/^(?:https?:\/\/)?((?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,})(?::\d+)?(?:[/?#].*)?$/u)?.[1];
  if (visible) {
    const shown = safeWebLink("https://" + visible);
    if (
      shown &&
      (getDomain(shown.hostname) || shown.hostname) !== (getDomain(u.hostname) || u.hostname)
    )
      return "the displayed address and destination are different";
  }
  return null;
}
export function ownTrackingPixel(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "vaelmail.com" &&
      /^\/api\/mail-open\/[A-Za-z0-9_-]{43}$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
export function knownTrackingPixel(value: string) {
  if (ownTrackingPixel(value)) return true;
  try {
    const u = new URL(value.startsWith("//") ? "https:" + value : value);
    if (!/^https?:$/.test(u.protocol)) return false;
    return (
      (u.hostname.endsWith(".list-manage.com") && /^\/track\/open(?:[/.]|$)/i.test(u.pathname)) ||
      (u.hostname.endsWith(".mailgun.org") && /^\/o\//.test(u.pathname)) ||
      /^\/(?:email\/)?(?:tracking-pixel|open-pixel|pixel-track)(?:[/.]|$)/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}
export function tinyTrackingImage(attrs: Record<string, string>) {
  const remote = /^(?:https?:)?\/\//i.test(attrs.src || "");
  if (!remote) return false;
  const style = (attrs.style || "").replace(/\s+/g, "");
  const width = Number(attrs.width || style.match(/(?:^|;)width:(\d+)(?:px)?(?:;|$)/)?.[1]);
  const height = Number(attrs.height || style.match(/(?:^|;)height:(\d+)(?:px)?(?:;|$)/)?.[1]);
  return (
    (Number.isFinite(width) &&
      Number.isFinite(height) &&
      width <= 2 &&
      height <= 2 &&
      (attrs.width !== undefined || /width:/.test(style)) &&
      (attrs.height !== undefined || /height:/.test(style))) ||
    /(?:^|;)(?:display:none|visibility:hidden|opacity:0)(?:;|$)/i.test(style)
  );
}
export function promisesAttachment(subject: string, body: string, plain = false, signature = "") {
  const authored =
    body.split(/(?:\n-- ?\n|<blockquote\b|<div[^>]+(?:signature|data-signature))/i)[0] ?? "";
  const normalize = (value: string) =>
    value
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  let text = normalize(plain ? authored : authored.replace(/<[^>]*>/g, " "));
  const signatureText = normalize(signature.replace(/<[^>]*>/g, " "));
  if (signatureText && text.endsWith(signatureText))
    text = text.slice(0, -signatureText.length).trimEnd();
  return /\b(?:i(?:'ve| have)? attached|please (?:see|find) (?:the )?attach(?:ed|ment)|see (?:the )?attached|attached (?:is|are|file|document|pdf)|attachment(?:s)? (?:included|below)|find (?:the )?attached)\b/i.test(
    subject + " " + text,
  );
}
