const CRLF = "\r\n";
const ARMOR_BEGIN = "-----BEGIN PGP MESSAGE-----";
const ARMOR_END = "-----END PGP MESSAGE-----";

export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

export function binaryToBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function base64Encode(bytes: Uint8Array, lineLength = 76): string {
  const encoded = btoa(bytesToBinary(bytes));
  if (!lineLength) return encoded;
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += lineLength) lines.push(encoded.slice(i, i + lineLength));
  return lines.join(CRLF);
}

function base64Decode(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const padded = clean + "===".slice((clean.length + 3) % 4);
  try {
    return binaryToBytes(atob(padded));
  } catch {
    return new Uint8Array();
  }
}

function quotedPrintableDecode(value: string): Uint8Array {
  const soft = value.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const c = soft[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      out.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(soft.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(out);
}

function decodeCharset(bytes: Uint8Array, charset = "utf-8"): string {
  try {
    return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function decodeEncodedWords(value: string): string {
  return value
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(
      /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
      (_, charset: string, encoding: string, text: string) => {
        const bytes =
          encoding.toUpperCase() === "B"
            ? base64Decode(text)
            : quotedPrintableDecode(text.replace(/_/g, " "));
        return decodeCharset(bytes, charset.replace(/\*.*$/, ""));
      },
    );
}

function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return "=?utf-8?B?" + base64Encode(utf8Bytes(value), 0) + "?=";
}

function quoteParam(value: string): string {
  return '"' + value.replace(/[\\"]/g, "\\$&") + '"';
}

function fileParam(name: string, value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return name + "=" + quoteParam(value);
  const encoded = encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return name + "*=utf-8''" + encoded;
}

type ContentType = { type: string; params: Record<string, string> };

function parseHeaderParams(value: string): ContentType {
  const [head, ...rest] = splitParams(value);
  const params: Record<string, string> = {};
  const continued: Record<string, { index: number; value: string; encoded: boolean }[]> = {};
  for (const item of rest) {
    const eq = item.indexOf("=");
    if (eq < 0) continue;
    let key = item.slice(0, eq).trim().toLowerCase();
    let raw = item.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)
      raw = raw.slice(1, -1).replace(/\\(.)/g, "$1");
    const match = key.match(/^([^*]+)(?:\*(\d+))?(\*)?$/);
    if (!match) continue;
    key = match[1] ?? key;
    if (match[2] !== undefined || match[3]) {
      (continued[key] ||= []).push({
        index: Number(match[2] ?? 0),
        value: raw,
        encoded: !!match[3],
      });
    } else params[key] = raw;
  }
  for (const [key, pieces] of Object.entries(continued)) {
    pieces.sort((a, b) => a.index - b.index);
    let charset = "utf-8";
    const bytes: number[] = [];
    pieces.forEach((piece, i) => {
      let text = piece.value;
      if (piece.encoded) {
        if (i === 0) {
          const parts = text.split("'");
          if (parts.length >= 3) {
            charset = parts[0] || "utf-8";
            text = parts.slice(2).join("'");
          }
        }
        text.replace(/%([0-9A-Fa-f]{2})|([\s\S])/g, (_, hex: string, ch: string) => {
          if (hex) bytes.push(parseInt(hex, 16));
          else for (const b of utf8Bytes(ch)) bytes.push(b);
          return "";
        });
      } else for (const b of utf8Bytes(text)) bytes.push(b);
    });
    params[key] = decodeCharset(Uint8Array.from(bytes), charset);
  }
  return { type: (head ?? "").trim().toLowerCase(), params };
}

function splitParams(value: string): string[] {
  const out: string[] = [];
  let current = "",
    quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && quoted) {
      current += c + (value[i + 1] ?? "");
      i++;
    } else if (c === '"') {
      quoted = !quoted;
      current += c;
    } else if (c === ";" && !quoted) {
      out.push(current);
      current = "";
    } else current += c;
  }
  out.push(current);
  return out;
}

type MimeEntity = {
  headers: [string, string][];
  contentType: ContentType;
  raw: string;
  body: string;
  parts: MimeEntity[];
};

function header(entity: MimeEntity, name: string): string | undefined {
  const key = name.toLowerCase();
  return entity.headers.find(([n]) => n === key)?.[1];
}

const MAX_DEPTH = 20;

export function parseMime(raw: string, depth = 0): MimeEntity {
  const split = raw.search(/\r?\n\r?\n/);
  const headerText = split < 0 ? raw : raw.slice(0, split);
  const body = split < 0 ? "" : raw.slice(split).replace(/^\r?\n\r?\n/, "");
  const headers: [string, string][] = [];
  for (const line of headerText.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && headers.length) {
      headers[headers.length - 1]![1] += " " + line.trim();
      continue;
    }
    const colon = line.indexOf(":");
    if (colon > 0)
      headers.push([line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()]);
  }
  const typeHeader = headers.find(([n]) => n === "content-type")?.[1];
  const contentType = typeHeader
    ? parseHeaderParams(typeHeader)
    : { type: "text/plain", params: { charset: "us-ascii" } };
  const entity: MimeEntity = { headers, contentType, raw, body, parts: [] };
  const boundary = contentType.params.boundary;
  if (contentType.type.startsWith("multipart/") && boundary && depth < MAX_DEPTH)
    entity.parts = splitMultipart(body, boundary).map((part) => parseMime(part, depth + 1));
  else if (contentType.type === "message/rfc822" && depth < MAX_DEPTH)
    entity.parts = [parseMime(decodeTransfer(entity), depth + 1)];
  return entity;
}

function splitMultipart(body: string, boundary: string): string[] {
  const delimiter = "--" + boundary;
  const parts: string[] = [];
  const lines = body.split(/(?<=\n)/);
  let current: string[] | null = null;
  for (const line of lines) {
    const trimmed = line.replace(/\r?\n$/, "").replace(/[ \t]+$/, "");
    if (trimmed === delimiter || trimmed === delimiter + "--") {
      if (current) parts.push(current.join("").replace(/\r?\n$/, ""));
      if (trimmed.endsWith("--") && trimmed === delimiter + "--") {
        current = null;
        break;
      }
      current = [];
    } else if (current) current.push(line);
  }
  if (current && current.length) parts.push(current.join("").replace(/\r?\n$/, ""));
  return parts;
}

function decodeTransfer(entity: MimeEntity): string {
  return bytesToBinary(decodeBody(entity));
}

function decodeBody(entity: MimeEntity): Uint8Array {
  const encoding = (header(entity, "content-transfer-encoding") || "7bit").toLowerCase().trim();
  if (encoding === "base64") return base64Decode(entity.body);
  if (encoding === "quoted-printable") return quotedPrintableDecode(entity.body);
  return binaryToBytes(entity.body);
}

function bodyText(entity: MimeEntity): string {
  return decodeCharset(decodeBody(entity), entity.contentType.params.charset || "utf-8");
}

function walk(entity: MimeEntity, visit: (e: MimeEntity) => boolean | void): boolean {
  if (visit(entity)) return true;
  for (const part of entity.parts) if (walk(part, visit)) return true;
  return false;
}

export type PgpKind = "pgp-mime" | "inline";

export function detectPgp(input: {
  contentType?: string | null;
  text?: string | null;
}): PgpKind | null {
  if (input.contentType) {
    const parsed = parseHeaderParams(input.contentType);
    if (parsed.type === "multipart/encrypted") {
      const protocol = parsed.params.protocol?.toLowerCase();
      if (!protocol || protocol === "application/pgp-encrypted") return "pgp-mime";
    }
  }
  if (input.text && input.text.includes(ARMOR_BEGIN)) return "inline";
  return null;
}

export function findArmoredMessage(root: MimeEntity): string | null {
  let found: string | null = null;
  walk(root, (entity) => {
    if (entity.parts.length) return false;
    const type = entity.contentType.type;
    if (type === "application/pgp-encrypted") return false;
    if (!(
      type.startsWith("text/") ||
      type === "application/octet-stream" ||
      type === "application/pgp"
    ))
      return false;
    const text = bodyText(entity);
    const start = text.indexOf(ARMOR_BEGIN);
    const end = text.indexOf(ARMOR_END, start);
    if (start >= 0 && end > start) {
      found = text.slice(start, end + ARMOR_END.length);
      return true;
    }
    return false;
  });
  return found;
}

export function armoredFromText(text: string): string | null {
  const start = text.indexOf(ARMOR_BEGIN);
  const end = text.indexOf(ARMOR_END, start);
  return start >= 0 && end > start ? text.slice(start, end + ARMOR_END.length) : null;
}

type DecryptedAttachment = {
  name: string;
  type: string;
  bytes: Uint8Array;
};
export type DecryptedContent = {
  text: string;
  html: string | null;
  attachments: DecryptedAttachment[];
  detached?: { signedText: string; signature: string };
  protectedSubject?: string;
};

function partName(entity: MimeEntity): string | null {
  const disposition = header(entity, "content-disposition");
  const fromDisposition = disposition ? parseHeaderParams(disposition).params.filename : undefined;
  const name = fromDisposition || entity.contentType.params.name;
  return name ? decodeEncodedWords(name) : null;
}

export function readDecryptedEntity(root: MimeEntity): DecryptedContent {
  const result: DecryptedContent = { text: "", html: null, attachments: [] };
  const subject = header(root, "subject");
  if (subject && root.contentType.params["protected-headers"])
    result.protectedSubject = decodeEncodedWords(subject);
  const visit = (entity: MimeEntity) => {
    const type = entity.contentType.type;
    if (type === "multipart/signed" && entity.parts.length >= 2) {
      const boundary = entity.contentType.params.boundary;
      const signed = boundary ? splitMultipart(entity.body, boundary)[0] : undefined;
      const signature = entity.parts.find(
        (p) => p.contentType.type === "application/pgp-signature",
      );
      if (signed !== undefined && signature && !result.detached)
        result.detached = {
          signedText: signed.replace(/\r?\n/g, "\r\n"),
          signature: bodyText(signature),
        };
      if (entity.parts[0]) visit(entity.parts[0]);
      return;
    }
    if (type === "multipart/alternative") {
      const html = entity.parts.find((p) => p.contentType.type === "text/html");
      const text = entity.parts.find((p) => p.contentType.type === "text/plain");
      if (text && !result.text) result.text = bodyText(text);
      if (html && result.html === null) result.html = bodyText(html);
      for (const part of entity.parts)
        if (part !== html && part !== text && part.parts.length) visit(part);
      return;
    }
    if (entity.parts.length) {
      for (const part of entity.parts) visit(part);
      return;
    }
    if (type === "application/pgp-signature") return;
    const disposition = (header(entity, "content-disposition") || "").toLowerCase();
    const name = partName(entity);
    const attachment =
      disposition.startsWith("attachment") || (!!name && !type.startsWith("text/"));
    if (!attachment && type === "text/plain" && !result.text) {
      result.text = bodyText(entity);
      return;
    }
    if (!attachment && type === "text/html" && result.html === null) {
      result.html = bodyText(entity);
      return;
    }
    result.attachments.push({
      name: name || "attachment",
      type: type || "application/octet-stream",
      bytes: decodeBody(entity),
    });
  };
  visit(root);
  return result;
}

export type OutgoingAttachment = { name: string; type: string; bytes: Uint8Array };

function randomBoundary(prefix = "vael"): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return prefix + "-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function textPart(type: "text/plain" | "text/html", value: string): string {
  return [
    `Content-Type: ${type}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Encode(utf8Bytes(value.replace(/\r?\n/g, "\r\n"))),
  ].join(CRLF);
}

function safeMimeType(type: string): string {
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(type)
    ? type.toLowerCase()
    : "application/octet-stream";
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 200) || "attachment";
}

export function buildInnerEntity(input: {
  text: string;
  html?: string | null;
  subject?: string;
  attachments?: OutgoingAttachment[];
  boundary?: (prefix: string) => string;
}): string {
  const boundary = input.boundary || randomBoundary;
  const protectedHeaders =
    input.subject !== undefined
      ? ["Subject: " + encodeHeaderWord(input.subject.replace(/[\r\n]+/g, " "))]
      : [];
  const protectedParam = input.subject !== undefined ? '; protected-headers="v1"' : "";
  const body = input.html
    ? (() => {
        const b = boundary("alt");
        return {
          type: `multipart/alternative; boundary="${b}"`,
          content: [
            "--" + b,
            textPart("text/plain", input.text),
            "--" + b,
            textPart("text/html", input.html),
            "--" + b + "--",
            "",
          ].join(CRLF),
        };
      })()
    : null;
  const attachments = input.attachments || [];
  if (!attachments.length) {
    if (body)
      return [
        `Content-Type: ${body.type}${protectedParam}`,
        ...protectedHeaders,
        "",
        body.content,
      ].join(CRLF);
    return [
      `Content-Type: text/plain; charset=utf-8${protectedParam}`,
      ...protectedHeaders,
      "Content-Transfer-Encoding: base64",
      "",
      base64Encode(utf8Bytes(input.text.replace(/\r?\n/g, "\r\n"))),
    ].join(CRLF);
  }
  const mixed = boundary("mixed");
  const lines = [
    `Content-Type: multipart/mixed; boundary="${mixed}"${protectedParam}`,
    ...protectedHeaders,
    "",
    "--" + mixed,
    body
      ? `Content-Type: ${body.type}${CRLF}${CRLF}${body.content}`
      : textPart("text/plain", input.text),
  ];
  for (const file of attachments) {
    const name = sanitizeFileName(file.name);
    lines.push(
      "--" + mixed,
      `Content-Type: ${safeMimeType(file.type)}; ${fileParam("name", name)}`,
      `Content-Disposition: attachment; ${fileParam("filename", name)}`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Encode(file.bytes),
    );
  }
  lines.push("--" + mixed + "--", "");
  return lines.join(CRLF);
}

export function wrapPgpMime(armored: string, boundary = randomBoundary("enc")): string {
  return [
    `Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="${boundary}"`,
    "",
    "This is an OpenPGP/MIME encrypted message (RFC 4880 and 3156)",
    "--" + boundary,
    "Content-Type: application/pgp-encrypted",
    "Content-Description: PGP/MIME version identification",
    "",
    "Version: 1",
    "",
    "--" + boundary,
    'Content-Type: application/octet-stream; name="encrypted.asc"',
    "Content-Description: OpenPGP encrypted message",
    'Content-Disposition: inline; filename="encrypted.asc"',
    "",
    armored.replace(/\r?\n/g, CRLF).replace(/\r\n$/, ""),
    "",
    "--" + boundary + "--",
    "",
  ].join(CRLF);
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) =>
      label.replace(/<[^>]+>/g, "") === href || href.startsWith("mailto:")
        ? label
        : `${label} (${href})`,
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
