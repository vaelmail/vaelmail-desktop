import { describe, expect, it } from "vitest";
import { resolveApplication, windowIdFor } from "@/lib/desktop/registry";

describe("resolveApplication", () => {
  it.each([
    ["/webmail/inbox", "mail"],
    ["/webmail/inbox?thread=abc", "mail"],
    ["/webmail/folders/xyz", "mail"],
    ["/webmail/aliases/abc", "mail"],
    ["/webmail/contacts", "contacts"],
    ["/webmail/aliases", "aliases"],
    ["/webmail/services", "services"],
    ["/webmail/settings/privacy", "settings"],
    ["/dashboard", "account"],
    ["/dashboard/storage", "account"],
    ["/dashboard/security", "security"],
    ["/dashboard/billing", "billing"],
    ["/dashboard/data", "data"],
    ["/dashboard/addresses/domains", "domains"],
    ["/desktop/settings", "desktop-settings"],
    ["/desktop/about", "about"],
  ])("maps %s to %s", (href, appId) => {
    expect(resolveApplication(href)?.appId).toBe(appId);
  });

  it("follows legacy redirects", () => {
    expect(resolveApplication("/webmail/settings/storage")?.href).toBe("/dashboard/storage");
    expect(resolveApplication("/webmail/settings/session")?.appId).toBe("security");
  });

  it("rejects external and unknown locations", () => {
    expect(resolveApplication("//evil.example")).toBeNull();
    expect(resolveApplication("https://evil.example")).toBeNull();
    expect(resolveApplication("/blog")).toBeNull();
    expect(resolveApplication("/dashboard/unknown")).toBeNull();
  });

  it("keys compose windows by draft", () => {
    expect(windowIdFor({ appId: "compose", href: "/", instanceId: "d1" })).toBe("compose:d1");
    expect(windowIdFor({ appId: "mail", href: "/" })).toBe("mail");
  });
});
