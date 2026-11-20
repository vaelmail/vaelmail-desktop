import type { MailItem, Message, Resources, Thread } from "./types";

type SearchTerm = { field: string; value: string };
const operators = new Set([
  "from",
  "to",
  "subject",
  "label",
  "in",
  "is",
  "has",
  "before",
  "after",
  "text",
  "body",
]);
export function parseSearch(query: string): SearchTerm[] {
  const terms: SearchTerm[] = [];
  let field = "",
    value = "",
    quoted = false,
    started = false;
  const finish = () => {
    if (started) terms.push({ field, value });
    field = "";
    value = "";
    started = false;
  };
  for (let at = 0; at < query.length; at++) {
    const char = query[at];
    if (char === '"') {
      quoted = !quoted;
      started = true;
      continue;
    }
    if (quoted && char === "\\" && ['"', "\\"].includes(query[at + 1] ?? "")) {
      value += query[++at] ?? "";
      started = true;
      continue;
    }
    if (!quoted && /\s/.test(char ?? "")) {
      finish();
      continue;
    }
    if (!quoted && char === ":" && !field && operators.has(value.toLowerCase())) {
      field = value.toLowerCase();
      value = "";
      started = true;
      continue;
    }
    value += char;
    started = true;
  }
  finish();
  return terms;
}
const normalized = (v: string) =>
  v
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
export function matchesSearch(
  terms: SearchTerm[],
  item: MailItem,
  messages: Message[],
  thread: Thread,
  resources: Resources,
  attachmentNames: string[],
) {
  return terms.every(({ field, value }) => {
    const contains = (s: string) => normalized(s).includes(normalized(value));
    switch (field) {
      case "from":
        return messages.some((m) => contains(m.from.email + " " + (m.from.name || "")));
      case "to":
        return messages.some((m) =>
          contains(
            [...m.to, ...m.cc, ...m.bcc].map((r) => r.email + " " + (r.name || "")).join(" ") +
              " " +
              m.deliveredTo,
          ),
        );
      case "subject":
        return contains(item.subject);
      case "label":
        return resources.labels.some((l) => thread.labelIds.includes(l.id) && contains(l.name));
      case "in": {
        if (value === "all") return !messages.every((m) => ["trash", "spam"].includes(m.folder));
        const folder = resources.folders.find((f) => normalized(f.name) === normalized(value));
        return messages.some((m) => m.folder === (folder?.id || value));
      }
      case "is":
        return value === "unread" ? item.unread : value === "starred" ? item.starred : false;
      case "has":
        return value === "attachment" && item.attachmentCount > 0;
      case "before":
        return !Number.isNaN(Date.parse(value)) && Date.parse(item.createdAt) < Date.parse(value);
      case "after":
        return !Number.isNaN(Date.parse(value)) && Date.parse(item.createdAt) >= Date.parse(value);
      default:
        return contains(
          [
            item.subject,
            ...messages.map(
              (m) =>
                m.text +
                " " +
                m.from.email +
                " " +
                (m.from.name || "") +
                " " +
                m.deliveredTo +
                " " +
                [...m.to, ...m.cc].map((r) => r.email).join(" "),
            ),
            ...attachmentNames,
          ].join(" "),
        );
    }
  });
}

export function formatSearchTerm({ field, value }: SearchTerm) {
  const safe =
    value.length > 0 && !/[\s":\\]/.test(value)
      ? value
      : '"' + value.replace(/["\\]/g, (c) => "\\" + c) + '"';
  return (field ? field + ":" : "") + safe;
}

export const advancedSearchFields = ["from", "to", "subject", "before", "after"] as const;
type AdvancedSearchField = (typeof advancedSearchFields)[number];
type AdvancedSearch = Record<AdvancedSearchField, string>;

export function splitAdvancedSearch(query: string): {
  text: string;
  fields: AdvancedSearch;
} {
  const fields: AdvancedSearch = {
      from: "",
      to: "",
      subject: "",
      before: "",
      after: "",
    },
    rest: SearchTerm[] = [];
  for (const term of parseSearch(query)) {
    const field = term.field as AdvancedSearchField;
    if ((advancedSearchFields as readonly string[]).includes(field) && !fields[field] && term.value)
      fields[field] = term.value;
    else rest.push(term);
  }
  return { text: rest.map(formatSearchTerm).join(" "), fields };
}

export function joinAdvancedSearch(text: string, fields: AdvancedSearch) {
  return [
    text.trim(),
    ...advancedSearchFields
      .filter((field) => fields[field].trim())
      .map((field) => formatSearchTerm({ field, value: fields[field].trim() })),
  ]
    .filter(Boolean)
    .join(" ");
}
