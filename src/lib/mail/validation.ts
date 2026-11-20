import { z } from "zod";
import { collections, systemViews, defaultSettings, type Settings } from "./types";

const id = z.uuid();
const short = z.string().trim().min(1).max(80);
const email = z.email().max(254);
const recipient = z.object({ email, name: z.string().max(200).optional() }).strict();
export const draftSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    identityId: id,
    to: z.array(recipient).max(100),
    cc: z.array(recipient).max(100),
    bcc: z.array(recipient).max(100),
    subject: z.string().max(998),
    html: z.string().max(500_000),
    editor: z.record(z.string(), z.unknown()).nullable(),
    plain: z.boolean(),
    attachmentIds: z.array(id).max(30),
    threadId: id.nullable(),
    replyToMessageId: id.nullable().optional(),
    trackOpens: z.boolean().optional(),
    quote: z.string().max(500_000),
  })
  .strict();
export const settingsSchema = z
  .object({
    theme: z.enum(["dark", "light", "system"]),
    density: z.enum(["comfortable", "compact"]),
    reader: z.enum(["split", "full"]),
    bodySize: z.union([z.literal(14), z.literal(16), z.literal(18)]),
    markRead: z.boolean(),
    previews: z.boolean(),
    grouping: z.boolean(),
    sort: z.enum(["newest", "oldest"]),
    afterAction: z.enum(["next", "list"]),
    defaultIdentity: id,
    plainText: z.boolean(),
    undoSeconds: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(20), z.literal(30)]),
    inAppNotifications: z.boolean(),
    desktopNotifications: z.boolean(),
    images: z.enum(["block", "ask", "contacts"]),
    shortcuts: z.boolean(),
    favicons: z.boolean(),
    localRecovery: z.boolean(),
    stripMetadata: z.boolean(),
    stripTrackingLinks: z.boolean(),
    blockTrackingPixels: z.boolean(),
    warnSuspiciousLinks: z.boolean(),
    attachmentReminder: z.boolean(),
    addTrackingPixel: z.boolean(),
  })
  .partial()
  .strict();
export function normalizeSettings(value: unknown): Settings {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    const checked = settingsSchema.shape[key].safeParse(input[key]);
    if (checked.success && checked.data !== undefined)
      Object.assign(result, { [key]: checked.data });
  }
  if (result.images === "contacts") result.images = "ask";
  return result;
}
export const filterSchema = z.object({
  view: z.string().max(100).default("inbox"),
  query: z.string().max(1000).default(""),
  unread: z.boolean().default(false),
  starred: z.boolean().default(false),
  attachment: z.boolean().default(false),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  cursor: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  category: z.enum(["codes", "receipts", "newsletters", "security"]).optional(),
  service: id.optional(),
});
export const actionSchema = z
  .object({
    ids: z.array(id).max(1000).default([]),
    filter: filterSchema.optional(),
    allMatching: z.boolean().optional(),
    type: z.enum([
      "read",
      "unread",
      "star",
      "unstar",
      "archive",
      "trash",
      "spam",
      "restore",
      "move",
      "label",
      "unlabel",
      "snooze",
      "unsnooze",
      "delete",
    ]),
    value: z.string().max(200).optional(),
  })
  .strict()
  .refine((v) => v.ids.length > 0 || (v.allMatching && v.filter), "choose some messages");
const order = z.number().int().min(0).max(10000).default(0);
const resourceSchemas = {
  services: z.object({
    name: short,
    senderDomains: z.array(z.string().trim().toLowerCase().max(253)).min(1).max(20),
    aliasIds: z.array(id).max(250).default([]),
    muted: z.boolean().default(false),
    order,
  }),
  contacts: z.object({
    name: z.string().max(200),
    emails: z.array(email).min(1).max(10),
    notes: z.string().max(5000),
    favorite: z.boolean(),
    order,
  }),
  aliases: z.object({
    address: z.string().max(254).default(""),
    description: z.string().max(200),
    generated: z.boolean(),
    enabled: z.boolean(),
    order,
  }),
  domains: z.object({
    name: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
    order,
  }),
  identities: z.object({
    email,
    name: z.string().max(200),
    signature: z.string().max(10000),
    domainId: id.nullable(),
    order,
  }),
  folders: z.object({ name: short, order }),
  labels: z.object({
    name: short,
    color: z.enum(["brass", "sage", "rose", "blue", "stone"]),
    order,
  }),
  rules: z.object({
    name: short,
    enabled: z.boolean(),
    match: z.enum(["all", "any"]),
    order,
    conditions: z
      .array(
        z.object({
          field: z.enum(["from", "to", "subject", "attachment"]),
          value: z.string().max(254),
        }),
      )
      .min(1)
      .max(10),
    actions: z
      .array(
        z.object({
          type: z.enum(["move", "label", "read", "star", "archive", "spam"]),
          value: z.string().max(100),
        }),
      )
      .min(1)
      .max(10),
  }),
  "saved-searches": z.object({
    name: short,
    query: z.string().trim().min(1).max(1000),
    order,
  }),
};
export const collectionSchema = z.enum(collections);
export function resourceSchema<K extends keyof typeof resourceSchemas>(
  collection: K,
): (typeof resourceSchemas)[K] {
  return resourceSchemas[collection];
}
export const sendSchema = z
  .object({
    key: z.uuid(),
    revision: z.number().int().nonnegative(),
    dueAt: z.iso.datetime().optional(),
    preparationId: id.optional(),
    originalApprovals: z
      .array(z.object({ id, hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
      .max(30)
      .optional(),
  })
  .strict();
export const startSchema = z.object({ timezone: z.string().max(100).default("UTC") }).strict();
export const controlSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reset") }).strict(),
  z.object({ type: z.literal("empty") }).strict(),
  z.object({ type: z.literal("plan"), plan: z.enum(["free", "plus"]) }).strict(),
  z
    .object({
      type: z.literal("incoming"),
      to: z.email().optional(),
      from: recipient.optional(),
      subject: z.string().max(998).optional(),
      text: z.string().max(100_000).optional(),
      threadId: id.optional(),
    })
    .strict(),
]);
export function validView(view: string) {
  return (
    (systemViews as readonly string[]).includes(view) ||
    /^(folders|labels|aliases)\/[\w-]+$/.test(view) ||
    view === "search"
  );
}
