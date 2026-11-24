export type Platform = "mac" | "windows" | "linux";

function detect(): Platform {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(agent)) return "mac";
  if (/Windows/.test(agent)) return "windows";
  return "linux";
}

export const platform: Platform = detect();

export const modifierLabel = platform === "mac" ? "⌘" : "Ctrl";
