import type { JSONContent } from "@tiptap/core";

export type Plan = "free" | "plus";
export type Recipient = { email: string; name?: string };
export type MailCategory = "codes" | "receipts" | "newsletters" | "security";
export type MailInsights = {
  categories: MailCategory[];
  senderDomain: string;
  detectedCode?: { value: string; messageId: string };
  serviceId?: string;
};
export type Settings = {
  theme: "dark" | "light" | "system";
  density: "comfortable" | "compact";
  reader: "split" | "full";
  bodySize: 14 | 16 | 18;
  markRead: boolean;
  previews: boolean;
  grouping: boolean;
  sort: "newest" | "oldest";
  afterAction: "next" | "list";
  defaultIdentity: string;
  plainText: boolean;
  undoSeconds: 0 | 5 | 10 | 20 | 30;
  inAppNotifications: boolean;
  desktopNotifications: boolean;
  images: "block" | "ask" | "contacts";
  shortcuts: boolean;
  favicons: boolean;
  localRecovery: boolean;
  stripMetadata: boolean;
  stripTrackingLinks: boolean;
  blockTrackingPixels: boolean;
  warnSuspiciousLinks: boolean;
  attachmentReminder: boolean;
  addTrackingPixel: boolean;
};
export const defaultSettings: Settings = {
  theme: "dark",
  density: "comfortable",
  reader: "split",
  bodySize: 16,
  markRead: true,
  previews: false,
  grouping: true,
  sort: "newest",
  afterAction: "next",
  defaultIdentity: "",
  plainText: false,
  undoSeconds: 0,
  inAppNotifications: true,
  desktopNotifications: false,
  images: "ask",
  shortcuts: true,
  favicons: true,
  localRecovery: false,
  stripMetadata: true,
  stripTrackingLinks: true,
  blockTrackingPixels: true,
  warnSuspiciousLinks: true,
  attachmentReminder: true,
  addTrackingPixel: false,
};
export type Mailbox = {
  id: string;
  address: string;
  plan: Plan;
  timezone: string;
  settings: Settings;
  generation: number;
  createdAt: string;
};
export type Attachment = {
  id: string;
  name: string;
  type: string;
  bytes: number;
  draftId: string | null;
  createdAt: string;
};
type EmailResource = {
  id: string;
  kind: "remote" | "embedded";
};
export type EmailRender = {
  version: 1;
  html: string;
  css: string;
  designed: boolean;
  resources: EmailResource[];
  warnings: string[];
  blockedTrackers?: number;
};
type MimeMetadata = {
  messageId?: string;
  contentType: string;
  imported: boolean;
};
export type Message = {
  id: string;
  threadId: string;
  from: Recipient;
  replyTo?: Recipient | null;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  html: string;
  hasHtml?: boolean;
  text: string;
  quote: string;
  direction: "incoming" | "outgoing";
  folder: string;
  read: boolean;
  deliveredTo: string;
  attachmentIds: string[];
  createdAt: string;
  remoteImageId?: string;
  render?: EmailRender;
  quoteRender?: EmailRender;
  mime?: MimeMetadata;
  imageVersion?: string;
  tracking?: OpenTracking;
  relayAcceptance?: {
    rejectedRecipients: string[];
    recipientResultUnknown: boolean;
  };
  authenticity?: Authenticity;
} & Partial<MailInsights>;
export type Authenticity = {
  verdict: "verified" | "unverified" | "spoofed";
  fromDomain: string;
  spf: string;
  spfDomain?: string;
  dkim: { result: string; domain: string; aligned: boolean }[];
  dmarc: string;
  dmarcPolicy?: string;
  source: "vael" | "legacy" | "internal" | "own" | "none";
  reasons: string[];
  warnings: string[];
};
export type Thread = {
  id: string;
  subject: string;
  starred: boolean;
  labelIds: string[];
  snoozedUntil: string | null;
  previousFolder: string | null;
  revision: number;
  updatedAt: string;
};
export type Conversation = Thread & {
  messages: Message[];
  attachments: Attachment[];
};
export type Draft = {
  id: string;
  revision: number;
  identityId: string;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  html: string;
  editor: JSONContent | null;
  plain: boolean;
  attachmentIds: string[];
  threadId: string | null;
  replyToMessageId?: string | null;
  trackOpens?: boolean;
  quote: string;
  updatedAt: string;
};
export type Job = {
  id: string;
  draftId: string;
  dueAt: string;
  state:
    | "queued"
    | "scheduled"
    | "submitting"
    | "transport-unknown"
    | "sent-copy-pending"
    | "sent-partial"
    | "failed"
    | "blocked"
    | "sent"
    | "cancelled";
  rejectedRecipients?: string[];
  recipientResultUnknown?: boolean;
  key: string;
  createdAt: string;
  threadId: string | null;
};
export type Contact = {
  id: string;
  name: string;
  emails: string[];
  notes: string;
  favorite: boolean;
  order: number;
};
export type Alias = {
  id: string;
  address: string;
  description: string;
  generated: boolean;
  enabled: boolean;
  order: number;
};
export type Service = {
  id: string;
  name: string;
  senderDomains: string[];
  aliasIds: string[];
  muted: boolean;
  order: number;
};
type ServiceSummary = Service & {
  messageCount: number;
  latestActivity: string | null;
};
export type ServiceSuggestion = {
  domain: string;
  name: string;
  aliasIds: string[];
  messageCount: number;
  latestActivity: string;
};
export type ServicesWorkspace = {
  services: ServiceSummary[];
  suggestions: ServiceSuggestion[];
};
export type Domain = {
  id: string;
  name: string;
  verified: boolean;
  token: string;
  order: number;
  verificationState?: "pending" | "verified" | "warning" | "disabled";
  checkedAt?: string | null;
  recipients?: { id: string; address: string }[];
};
export type Identity = {
  id: string;
  email: string;
  name: string;
  signature: string;
  domainId: string | null;
  order: number;
};
export type Folder = { id: string; name: string; order: number };
export type Label = { id: string; name: string; color: string; order: number };
export type RuleCondition = {
  field: "from" | "to" | "subject" | "attachment";
  value: string;
};
export type RuleAction = {
  type: "move" | "label" | "read" | "star" | "archive" | "spam";
  value: string;
};
export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  match: "all" | "any";
  conditions: RuleCondition[];
  actions: RuleAction[];
  order: number;
};
type SavedSearch = {
  id: string;
  name: string;
  query: string;
  order: number;
};
export type ResourceMap = {
  services: Service;
  contacts: Contact;
  aliases: Alias;
  domains: Domain;
  identities: Identity;
  folders: Folder;
  labels: Label;
  rules: Rule;
  "saved-searches": SavedSearch;
};
export type Collection = keyof ResourceMap;
export type Resource = ResourceMap[Collection];
export type Resources = { [K in Collection]: ResourceMap[K][] };
export type Bootstrap = {
  mode?: "demo" | "production";
  filtering?: { pending: boolean; error: boolean };
  mailbox: Mailbox;
  resources: Resources;
  counts: Record<string, number>;
  storage: { used: number; limit: number };
  capabilities: {
    send: boolean;
    domains: number;
    customAliases: number;
    generatedAliases: number;
  };
  staff?: { console: string };
};
export type MailItem = {
  id: string;
  kind: "thread" | "draft" | "job" | "message";
  threadId: string | null;
  sender: Recipient;
  subject: string;
  preview: string;
  createdAt: string;
  unread: boolean;
  starred: boolean;
  labelIds: string[];
  attachmentCount: number;
  messageCount: number;
  deliveredTo: string;
  folder: string;
  dueAt?: string;
  status?: Job["state"];
  messageId?: string;
  tracking?: OpenTracking;
  locked?: boolean;
} & Partial<MailInsights>;
export type MailList = {
  items: MailItem[];
  total: number;
  nextCursor: string | null;
};
export type MailFilter = {
  view: string;
  query: string;
  unread: boolean;
  starred: boolean;
  attachment: boolean;
  sort: "newest" | "oldest";
  cursor?: string;
  limit?: number;
  category?: MailCategory;
  service?: string;
};
export type MailAction = {
  ids: string[];
  filter?: MailFilter;
  allMatching?: boolean;
  type:
    | "read"
    | "unread"
    | "star"
    | "unstar"
    | "archive"
    | "trash"
    | "spam"
    | "restore"
    | "move"
    | "label"
    | "unlabel"
    | "snooze"
    | "unsnooze"
    | "delete";
  value?: string;
};
export type ActionResult = {
  count: number;
  undoId?: string;
  expiresAt?: string;
};
export type ApiFailure = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
  latest?: Draft;
};
export const collections: Collection[] = [
  "services",
  "contacts",
  "aliases",
  "domains",
  "identities",
  "folders",
  "labels",
  "rules",
  "saved-searches",
];
export const systemViews = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "scheduled",
  "snoozed",
  "archive",
  "spam",
  "trash",
  "all",
] as const;
export const settingsSections = [
  ["appearance", "appearance"],
  ["reading", "inbox & reading"],
  ["compose", "compose"],
  ["notifications", "notifications"],
  ["privacy", "privacy"],
  ["plugins", "plugins"],
  ["organization", "organization"],
  ["rules", "rules"],
  ["shortcuts", "shortcuts"],
] as const;
export function formatBytes(bytes: number) {
  if (bytes < 1000) return bytes + " b";
  if (bytes < 1e6) return (bytes / 1000).toFixed(1) + " kb";
  if (bytes < 1e9) return (bytes / 1e6).toFixed(1) + " mb";
  return (bytes / 1e9).toFixed(1) + " gb";
}
export function initials(name: string) {
  return (
    name
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "V"
  );
}

export type OpenTracking = {
  id: string;
  state: "active" | "seen" | "expired" | "stopped";
  firstOpenedAt: string | null;
  expiresAt: string | null;
};
export type SendPreparation = {
  id: string;
  revision: number;
  files: {
    id: string;
    name: string;
    hash: string;
    status: "cleaned" | "unchanged" | "original-required";
    reason?: string;
  }[];
};
