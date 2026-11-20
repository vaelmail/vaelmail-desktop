import {
  defaultSettings,
  type Bootstrap,
  type Conversation,
  type MailItem,
} from "@/lib/mail/types";
import type { AccountSnapshot } from "@/lib/account";

const now = Date.now();
const iso = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const mailbox = {
  id: "mock-mailbox",
  address: "river@vael.email",
  plan: "plus" as const,
  timezone: "UTC",
  settings: { ...defaultSettings, desktopNotifications: true },
  generation: 1,
  createdAt: iso(60 * 24 * 90),
};

export const bootstrap: Bootstrap = {
  mode: "production",
  mailbox,
  resources: {
    services: [
      {
        id: "s1",
        name: "Workshop Weekly",
        senderDomains: ["workshop.example"],
        aliasIds: [],
        muted: false,
        order: 0,
      },
    ],
    contacts: [
      {
        id: "c1",
        name: "Mara Ellis",
        emails: ["mara@example.org"],
        notes: "",
        favorite: true,
        order: 0,
      },
      {
        id: "c2",
        name: "Noah Bennett",
        emails: ["noah@example.org"],
        notes: "",
        favorite: false,
        order: 1,
      },
    ],
    aliases: [
      {
        id: "a1",
        address: "shop@vael.pw",
        description: "shopping",
        generated: false,
        enabled: true,
        order: 0,
      },
    ],
    domains: [],
    identities: [
      {
        id: "i1",
        email: "river@vael.email",
        name: "River",
        isDefault: true,
        order: 0,
      } as unknown as Bootstrap["resources"]["identities"][number],
    ],
    folders: [
      { id: "f1", name: "Keep", order: 0 } as unknown as Bootstrap["resources"]["folders"][number],
    ],
    labels: [
      {
        id: "l1",
        name: "work",
        color: "#b9d778",
        order: 0,
      } as unknown as Bootstrap["resources"]["labels"][number],
    ],
    rules: [],
    "saved-searches": [],
  },
  counts: {
    all: 6,
    inbox: 3,
    starred: 2,
    sent: 1,
    drafts: 0,
    scheduled: 0,
    snoozed: 0,
    archive: 1,
    spam: 0,
    trash: 0,
  },
  storage: { used: 4_600_000, limit: 1_000_000_000 },
  capabilities: { send: true, domains: 3, customAliases: 50, generatedAliases: 999 },
};

function item(
  id: string,
  name: string,
  email: string,
  subject: string,
  minutes: number,
  extra: Partial<MailItem> = {},
): MailItem {
  return {
    id,
    kind: "thread",
    threadId: id,
    sender: { name, email },
    subject,
    preview: "A short preview of this conversation.",
    createdAt: iso(minutes),
    unread: false,
    starred: false,
    labelIds: [],
    attachmentCount: 0,
    messageCount: 1,
    deliveredTo: "river@vael.email",
    folder: "INBOX",
    senderDomain: email.split("@")[1] ?? "",
    categories: [],
    ...extra,
  } as MailItem;
}

export const inbox: MailItem[] = [
  item("t1", "Mara Ellis", "mara@example.org", "A few thoughts for Friday", 12, {
    unread: true,
    starred: true,
    messageCount: 2,
  }),
  item("t2", "Field Notes", "orders@fieldnotes.example", "Your order is on its way", 80, {
    unread: true,
  }),
  item("t3", "Noah Bennett", "noah@example.org", "The weekend route", 190, {
    unread: true,
    attachmentCount: 1,
  }),
  item("t4", "Workshop Weekly", "digest@workshop.example", "This week at the workshop", 60 * 30, {
    starred: true,
  }),
  item("t5", "The Reading Room", "hello@readingroom.example", "Something worth keeping", 60 * 50),
  item(
    "t6",
    "Studio Supply",
    "receipts@studiosupply.example",
    "Your receipt from Studio Supply",
    60 * 70,
  ),
];

export function conversation(id: string): Conversation {
  const subject = inbox.find((entry) => entry.id === id)?.subject ?? "Conversation";
  return {
    id,
    subject,
    starred: false,
    labelIds: [],
    snoozedUntil: null,
    previousFolder: null,
    revision: 1,
    updatedAt: iso(10),
    attachments: [],
    messages: [
      {
        id: `${id}-m1`,
        threadId: id,
        from: { name: "Mara Ellis", email: "mara@example.org" },
        to: [{ email: "river@vael.email" }],
        cc: [],
        bcc: [],
        subject,
        html: "<p>Hi River,</p><p>A few thoughts about Friday. Let me know if the plan still works.</p>",
        hasHtml: true,
        text: "Hi River,\n\nA few thoughts about Friday.",
        quote: "",
        direction: "incoming",
        folder: "INBOX",
        read: false,
        deliveredTo: "river@vael.email",
        attachmentIds: [],
        createdAt: iso(12),
        render: {
          version: 1,
          html: "<p>Hi River,</p><p>A few thoughts about Friday. Let me know if the plan still works.</p>",
          css: "",
          designed: false,
          resources: [],
          warnings: [],
        },
      },
    ],
  } as unknown as Conversation;
}

export const account = {
  address: "river@vael.email",
  createdAt: iso(60 * 24 * 90),
  plan: "plus",
  plusExpiresAt: iso(-60 * 24 * 200),
  revision: 1,
  status: "active",
  storage: {
    messages: 3_000_000,
    drafts: 100_000,
    attachments: 1_400_000,
    sources: 100_000,
    used: 4_600_000,
    limit: 1_000_000_000,
    breakdownAvailable: true,
  },
  security: {
    twoFactor: true,
    totp: true,
    passkeyCount: 0,
    keyVersion: 1,
    keySuffix: "4821",
    keyChangedAt: null,
    devices: [],
    recoveryCount: 8,
  },
  sessions: [
    {
      id: "x1",
      name: "VaelMail Desktop · Linux",
      current: true,
      simulated: false,
      lastActive: iso(1),
      expiresAt: iso(-60 * 24 * 20),
    },
  ],
  purchases: [],
  activity: [{ id: "e1", title: "Signed in", createdAt: iso(2) }],
} as unknown as AccountSnapshot;
