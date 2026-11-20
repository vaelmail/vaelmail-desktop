import { bridge } from "@/lib/bridge";

const external = /^(https?:|mailto:)/i;

export function interceptExternalLinks(): () => void {
  const handler = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button > 1) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!external.test(href)) return;
    event.preventDefault();
    void bridge.files.openExternal(href);
  };
  document.addEventListener("click", handler);
  document.addEventListener("auxclick", handler);
  return () => {
    document.removeEventListener("click", handler);
    document.removeEventListener("auxclick", handler);
  };
}
