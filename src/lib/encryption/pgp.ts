import type * as OpenPgp from "openpgp";
import { lookupKey, pgpSecret, type PgpKeyUpload } from "@/lib/encryption/api";
import { onMailboxLock } from "@/lib/encryption/lock-state";
import {
  armoredFromText,
  binaryToBytes,
  buildInnerEntity,
  bytesToBinary,
  findArmoredMessage,
  parseMime,
  readDecryptedEntity,
  utf8Bytes,
  wrapPgpMime,
  type DecryptedContent,
  type OutgoingAttachment,
  type PgpKind,
} from "@/lib/encryption/pgp-mime";

let library: Promise<typeof OpenPgp> | null = null;
function loadOpenPgp(): Promise<typeof OpenPgp> {
  library ||= import("openpgp");
  return library;
}

let ownKey: Promise<OpenPgp.PrivateKey> | null = null;
const decrypted = new Map<string, DecryptResult>();
const senderKeys = new Map<string, Promise<OpenPgp.PublicKey | null>>();

function forgetOpenPgpSecrets() {
  ownKey = null;
  decrypted.clear();
  senderKeys.clear();
}
if (typeof window !== "undefined") onMailboxLock(forgetOpenPgpSecrets);

export async function generateAccountKey(
  primaryAddress: string,
  passphrase: string,
): Promise<PgpKeyUpload> {
  const openpgp = await loadOpenPgp();
  const email = primaryAddress.trim().toLowerCase();
  if (!email) throw new Error("no address for the OpenPGP key");
  const userIDs = [{ email }];
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs,
    passphrase,
    format: "armored",
  });
  const key = await openpgp.readKey({ armoredKey: publicKey });
  return { publicKey, privateKey, fingerprint: key.getFingerprint().toUpperCase() };
}

export async function relockPrivateKey(
  armored: string,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<string> {
  const openpgp = await loadOpenPgp();
  const locked = await openpgp.readPrivateKey({ armoredKey: armored });
  const open = await openpgp.decryptKey({ privateKey: locked, passphrase: oldPassphrase });
  const relocked = await openpgp.encryptKey({ privateKey: open, passphrase: newPassphrase });
  return relocked.armor();
}

export async function inspectPublicKey(armored: string) {
  const openpgp = await loadOpenPgp();
  const key = await openpgp.readKey({ armoredKey: armored.trim() });
  if (key.isPrivate()) throw new Error("this is a private key. paste only the public key.");
  return {
    fingerprint: key.getFingerprint().toUpperCase(),
    emails: key.getUserIDs(),
    armored: key.armor(),
  };
}

function unlockedOwnKey(): Promise<OpenPgp.PrivateKey> {
  ownKey ||= (async () => {
    const [openpgp, secret] = await Promise.all([loadOpenPgp(), pgpSecret()]);
    if (!secret.privateKey)
      throw new Error("your OpenPGP key is not available. reload and try again.");
    const locked = await openpgp.readPrivateKey({ armoredKey: secret.privateKey });
    return openpgp.decryptKey({ privateKey: locked, passphrase: secret.passphrase });
  })();
  ownKey.catch(() => {
    ownKey = null;
  });
  return ownKey;
}

function publicKeyFor(email: string): Promise<OpenPgp.PublicKey | null> {
  const address = email.trim().toLowerCase();
  let pending = senderKeys.get(address);
  if (!pending) {
    pending = (async () => {
      const found = await lookupKey(address);
      if (!found.found || !found.publicKey) return null;
      const openpgp = await loadOpenPgp();
      return openpgp.readKey({ armoredKey: found.publicKey });
    })();
    pending.catch(() => senderKeys.delete(address));
    senderKeys.set(address, pending);
  }
  return pending;
}

type SignatureStatus = "valid" | "invalid" | "unknown-key" | "unsigned";
export type DecryptResult = {
  content: DecryptedContent;
  signature: SignatureStatus;
};

export function cachedDecryption(messageId: string) {
  return decrypted.get(messageId);
}

export async function decryptStoredMessage(input: {
  messageId: string;
  kind: PgpKind;
  source: Uint8Array | null;
  fallbackText?: string;
  senderEmail?: string;
}): Promise<DecryptResult> {
  const cached = decrypted.get(input.messageId);
  if (cached) return cached;
  const armored =
    (input.source ? findArmoredMessage(parseMime(bytesToBinary(input.source))) : null) ||
    (input.fallbackText ? armoredFromText(input.fallbackText) : null);
  if (!armored) throw new Error("no OpenPGP message was found in this email");
  const [openpgp, privateKey, senderKey] = await Promise.all([
    loadOpenPgp(),
    unlockedOwnKey(),
    input.senderEmail ? publicKeyFor(input.senderEmail).catch(() => null) : Promise.resolve(null),
  ]);
  const message = await openpgp.readMessage({ armoredMessage: armored });
  const result = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey,
    verificationKeys: senderKey ? [senderKey] : [],
    format: "binary",
  });
  const data = result.data as Uint8Array;
  const content: DecryptedContent =
    input.kind === "pgp-mime"
      ? readDecryptedEntity(parseMime(bytesToBinary(data)))
      : { text: new TextDecoder().decode(data), html: null, attachments: [] };
  let signature = await signatureStatus(result.signatures, !!senderKey);
  if (signature === "unsigned" && content.detached) {
    signature = senderKey
      ? await verifyDetached(openpgp, content.detached, senderKey)
      : "unknown-key";
  }
  const value = { content, signature };
  decrypted.set(input.messageId, value);
  return value;
}

async function signatureStatus(
  signatures: { verified: Promise<unknown> }[],
  haveKey: boolean,
): Promise<SignatureStatus> {
  if (!signatures.length) return "unsigned";
  if (!haveKey) return "unknown-key";
  try {
    for (const s of signatures) await s.verified;
    return "valid";
  } catch {
    return "invalid";
  }
}

async function verifyDetached(
  openpgp: typeof OpenPgp,
  detached: NonNullable<DecryptedContent["detached"]>,
  key: OpenPgp.PublicKey,
): Promise<SignatureStatus> {
  try {
    const signature = await openpgp.readSignature({ armoredSignature: detached.signature });
    const message = await openpgp.createMessage({ binary: binaryToBytes(detached.signedText) });
    const result = await openpgp.verify({ message, signature, verificationKeys: [key] });
    return signatureStatus(result.signatures, true);
  } catch {
    return "invalid";
  }
}

export async function recipientKeys(emails: string[]) {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  const results = await Promise.all(
    unique.map(async (email) => [email, await publicKeyFor(email).catch(() => null)] as const),
  );
  return {
    keys: results.flatMap(([, key]) => (key ? [key] : [])),
    missing: results.filter(([, key]) => !key).map(([email]) => email),
  };
}

export async function buildEncryptedMime(input: {
  recipients: string[];
  subject: string;
  text: string;
  html?: string | null;
  attachments: OutgoingAttachment[];
}): Promise<string> {
  const [openpgp, privateKey, found] = await Promise.all([
    loadOpenPgp(),
    unlockedOwnKey(),
    recipientKeys(input.recipients),
  ]);
  if (found.missing.length) throw new Error("no OpenPGP key for " + found.missing.join(", "));
  const inner = buildInnerEntity({
    text: input.text,
    html: input.html,
    subject: input.subject,
    attachments: input.attachments,
  });
  const armored = await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: utf8Bytes(inner) }),
    encryptionKeys: [...found.keys, privateKey.toPublic()],
    signingKeys: privateKey,
    format: "armored",
  });
  return wrapPgpMime(armored as string);
}
