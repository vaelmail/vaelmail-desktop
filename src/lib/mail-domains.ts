export const signupDomains = ["vael.email", "reca.st", "extradit.ing"] as const;
export type SignupDomain = (typeof signupDomains)[number];
export const defaultSignupDomain: SignupDomain = "vael.email";

export const aliasDomains = ["vael.pw", "reca.st", "extradit.ing"] as const;
type AliasDomain = (typeof aliasDomains)[number];
export const defaultAliasDomain: AliasDomain = "vael.pw";

export const sendingDomains = ["vael.email", "reca.st", "extradit.ing"] as const;
const isSendingDomain = (value: unknown): boolean =>
  typeof value === "string" && (sendingDomains as readonly string[]).includes(value);
export const aliasCanSend = (address: string) =>
  address.includes("@") && isSendingDomain(address.slice(address.lastIndexOf("@") + 1));

const atList = (domains: readonly string[]) => {
  const at = domains.map((d) => "@" + d);
  return at.length < 2 ? at.join("") : at.slice(0, -1).join(", ") + " and " + at[at.length - 1];
};
export const receiveOnlyAliasDomains = aliasDomains.filter((d) => !isSendingDomain(d));
export const aliasSendingNote = `aliases on ${atList(sendingDomains)} can send on plus: pick one as from when writing. ${atList(receiveOnlyAliasDomains)} aliases are receive-only.`;

export const isSignupDomain = (value: unknown): value is SignupDomain =>
  typeof value === "string" && (signupDomains as readonly string[]).includes(value);
export const isAliasDomain = (value: unknown): value is AliasDomain =>
  typeof value === "string" && (aliasDomains as readonly string[]).includes(value);

const localPartPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const validAliasLocal = (local: string) =>
  local.length >= 3 && local.length <= 32 && localPartPattern.test(local);

export function aliasDomainOf(address: string): AliasDomain | null {
  const at = address.indexOf("@");
  if (at < 0) return null;
  const local = address.slice(0, at),
    domain = address.slice(at + 1);
  return isAliasDomain(domain) && validAliasLocal(local) ? domain : null;
}
