import { useEffect } from "react";
import { toast } from "sonner";
import { bridge, on } from "@/lib/bridge";
import type { Mailto } from "@/lib/bridge/desktop";
import { openHref } from "@/shell/store";
import { useMail } from "./context";

function draftFrom(message: Mailto) {
  const recipients = (list: string[]) => list.map((email) => ({ email }));
  return {
    to: recipients(message.to),
    cc: recipients(message.cc),
    bcc: recipients(message.bcc),
    subject: message.subject,
    html: message.body ? `<p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>` : "",
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

export function useNativeEvents(): void {
  const { compose } = useMail();

  useEffect(() => {
    const drain = async () => {
      for (const message of await bridge.desktop.takeMailto()) await compose(draftFrom(message));
    };
    void drain();
    const pending = on("mailto:pending", () => void drain());
    const tray = on("tray:compose", () => void compose());
    const inbox = on("shell:inbox", () => void openHref("/webmail/inbox"));
    const activated = on("notification:activated", ({ threadId }) => {
      void openHref(threadId ? `/webmail/inbox?thread=${threadId}` : "/webmail/inbox");
    });
    const challenge = on("challenge:required", ({ retryAfter }) => {
      toast.message(`VaelMail is verifying traffic. Retrying in ${retryAfter} seconds.`);
    });
    const updates = on("updates:available", ({ version }) => {
      toast.message(`VaelMail ${version} is available.`, {
        duration: Infinity,
        action: {
          label: "install and restart",
          onClick: () => void bridge.desktop.updates.install(),
        },
      });
    });
    return () => {
      for (const listening of [pending, tray, inbox, activated, challenge, updates]) {
        void listening.then((unlisten) => unlisten());
      }
    };
  }, [compose]);
}
