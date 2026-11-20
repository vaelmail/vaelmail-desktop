import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/mail/client";
import { bridge } from "@/lib/bridge";
import type { Message } from "@/lib/mail/types";
import { useMail } from "@/features/mailbox/context";
import { Button, MailLink, Modal } from "@/ui/controls";
import { safeWebLink, suspiciousLink, stripTrackingParameters } from "@/lib/mail/plugins";
import { MessageFrame } from "./message-frame";
import { TrackingDetails } from "./tracking";

export function MessageContent({
  message,
  index,
  light,
}: {
  message: Message;
  index: number;
  light: boolean;
}) {
  const { data, compose } = useMail();
  const hasHtml = message.hasHtml ?? Boolean(message.html.trim());
  const [plain, setPlain] = useState(!hasHtml);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"blocked" | "loading" | "loaded" | "failed">("blocked");
  const [error, setError] = useState("");
  const [link, setLink] = useState<{
    href: string;
    original: string;
    label: string;
    menu: boolean;
  } | null>(null);
  const inspectLink = (value: { href: string; original: string; label: string; menu: boolean }) => {
    if (safeWebLink(value.href) && safeWebLink(value.original)) setLink(value);
  };
  const state = useRef<{
    controller?: AbortController;
    grant?: string;
    assets: Record<string, string>;
    bytes: number;
  }>({ assets: {}, bytes: 0 });
  const resources = Array.from(
    new Map(
      [...(message.render?.resources || []), ...(message.quoteRender?.resources || [])].map((r) => [
        r.id,
        r,
      ]),
    ).values(),
  );
  const mailbox = data.mailbox;
  const revoke = (grant?: string) => {
    if (grant)
      void api(
        `messages/${message.id}/images/${grant}`,
        "DELETE",
        undefined,
        mailbox.generation,
      ).catch(() => {});
  };
  useEffect(() => {
    const current = state.current;
    return () => {
      current.controller?.abort();
      if (current.grant)
        void api(
          `messages/${message.id}/images/${current.grant}`,
          "DELETE",
          undefined,
          mailbox.generation,
        ).catch(() => {});
      current.assets = {};
    };
  }, [message.id, mailbox.generation]);
  const block = () => {
    state.current.controller?.abort();
    revoke(state.current.grant);
    state.current.controller = undefined;
    state.current.grant = undefined;
    state.current.assets = {};
    state.current.bytes = 0;
    setAssets({});
    setStatus("blocked");
    setError("");
  };
  const load = async () => {
    const current = state.current;
    current.controller?.abort();
    const controller = new AbortController();
    current.controller = controller;
    setStatus("loading");
    setError("");
    try {
      if (!current.grant) {
        const result = await api<{ grant: string }>(
          `messages/${message.id}/images`,
          "POST",
          message.imageVersion ? { version: message.imageVersion } : {},
          mailbox.generation,
          controller.signal,
        );
        if (controller.signal.aborted) {
          revoke(result.grant);
          return;
        }
        current.grant = result.grant;
      }
      const queue = resources.filter((r) => !current.assets[r.id]);
      let cursor = 0,
        failures = 0,
        expired = false;
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (cursor < queue.length && !controller.signal.aborted) {
            const r = queue[cursor++];
            try {
              const image = await bridge.apiImage(
                `/api/webmail/messages/${message.id}/resources/${r?.id}`,
                current.grant ?? "",
                mailbox.generation,
              );
              if (controller.signal.aborted) return;
              if (!image.ok) {
                if (
                  [
                    "image_permission",
                    "image_permission_required",
                    "image_permission_changed",
                  ].includes(image.code)
                )
                  expired = true;
                throw new Error(image.message || "image unavailable");
              }
              if (current.bytes + image.size > 25_000_000)
                throw new Error("this message reached the image loading limit");
              current.bytes += image.size;
              const value = image.dataUrl;
              current.assets = { ...current.assets, [r?.id ?? ""]: value };
              setAssets(current.assets);
            } catch (e) {
              if (controller.signal.aborted) return;
              failures++;
              setError((e as Error).message);
            }
          }
        }),
      );
      if (!controller.signal.aborted) {
        if (expired) {
          revoke(current.grant);
          current.grant = undefined;
        }
        setStatus(failures ? "failed" : "loaded");
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setStatus("failed");
        setError((e as Error).message);
      }
    }
  };
  const title = `message ${index + 1} from ${message.from.name || message.from.email}`;
  const mailto = (href: string) => {
    try {
      const url = new URL(href);
      if (url.protocol !== "mailto:") return;
      const recipients = (value: string) =>
        decodeURIComponent(value)
          .split(",")
          .map((email) => email.trim())
          .filter(
            (email) => /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(email) && email.length <= 254,
          )
          .slice(0, 100)
          .map((email) => ({ email }));
      const body = (url.searchParams.get("body") || "").slice(0, 10000).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
      void compose({
        to: recipients(url.pathname),
        cc: recipients(url.searchParams.get("cc") || ""),
        bcc: recipients(url.searchParams.get("bcc") || ""),
        subject: (url.searchParams.get("subject") || "").slice(0, 998),
        html: "<p>" + body.replace(/\r?\n/g, "<br>") + "</p>",
        quote: "",
      });
    } catch {}
  };
  return (
    <>
      {message.tracking && <TrackingDetails tracking={message.tracking} />}
      <div
        className="wm-message-format"
        role="group"
        aria-label={`display options for message ${index + 1}`}
      >
        <button
          type="button"
          aria-pressed={!plain}
          disabled={!hasHtml}
          onClick={() => setPlain(false)}
        >
          formatted
        </button>
        <button type="button" aria-pressed={plain} onClick={() => setPlain(true)}>
          plain text
        </button>
      </div>
      {!plain && resources.length > 0 && (
        <div className="wm-message-privacy">
          <div>
            <span role="status">
              {status === "blocked"
                ? `${resources.length} ${resources.length === 1 ? "image" : "images"} blocked`
                : status === "loading"
                  ? "loading message images…"
                  : status === "failed"
                    ? "some images could not be loaded"
                    : "images allowed for this message"}
            </span>
            <small>
              {status === "blocked"
                ? resources.some((r) => r.kind === "remote")
                  ? "remote images may reveal that you opened this message."
                  : "these images are included in the message and load without contacting the sender."
                : status === "failed"
                  ? error
                  : "permission ends when you leave this conversation."}
            </small>
          </div>
          <div className="wm-message-privacy-actions">
            {mailbox.settings.images === "block" ? (
              <MailLink className="wm-button" href="/webmail/settings/privacy">
                image preferences
              </MailLink>
            ) : status === "blocked" ? (
              <Button onClick={() => void load()}>load images</Button>
            ) : status === "failed" ? (
              <Button onClick={() => void load()}>retry images</Button>
            ) : null}
            {status !== "blocked" && <Button onClick={block}>block images again</Button>}
          </div>
        </div>
      )}
      {!!message.render?.blockedTrackers && (
        <p className="wm-email-warning" role="status">
          {message.render.blockedTrackers} tracking{" "}
          {message.render.blockedTrackers === 1 ? "image" : "images"} blocked
        </p>
      )}
      {message.render?.warnings.map((w) => (
        <p key={w} className="wm-email-warning" role="status">
          {w}
        </p>
      ))}
      {plain ? (
        <pre className="wm-plain-message">
          {(message.text || "this message has no plain-text content.")
            .split(/(https?:\/\/[^\s<>"\u0000-\u001f]+)/g)
            .map((part, i) => {
              if (!safeWebLink(part)) return part;
              const href = mailbox.settings.stripTrackingLinks
                ? stripTrackingParameters(part)
                : part;
              const warning = mailbox.settings.warnSuspiciousLinks && suspiciousLink(href, part);
              return (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (warning) {
                      e.preventDefault();
                      inspectLink({
                        href,
                        original: part,
                        label: part,
                        menu: false,
                      });
                    }
                  }}
                  onAuxClick={(e) => {
                    if (warning && e.button === 1) {
                      e.preventDefault();
                      inspectLink({
                        href,
                        original: part,
                        label: part,
                        menu: false,
                      });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    inspectLink({
                      href,
                      original: part,
                      label: part,
                      menu: true,
                    });
                  }}
                >
                  {href}
                </a>
              );
            })}
        </pre>
      ) : (
        <div className={message.render?.designed ? "wm-designed-email" : ""}>
          <MessageFrame
            title={title}
            html={message.html}
            render={message.render}
            assets={assets}
            light={light}
            fontSize={mailbox.settings.bodySize}
            onMailto={mailto}
            onLink={inspectLink}
          />
        </div>
      )}
      <Modal
        open={!!link}
        onClose={() => setLink(null)}
        title={link?.menu ? "link details" : "check this destination"}
      >
        {link && (
          <>
            <p className="wm-muted">
              {suspiciousLink(link.href, link.label) ||
                "this is the destination your browser will open."}
            </p>
            <code className="wm-link-destination">{link.href}</code>
            {link.original !== link.href && (
              <details>
                <summary>original link</summary>
                <code className="wm-link-destination">{link.original}</code>
              </details>
            )}
            <div className="wm-modal-actions">
              <Button onClick={() => setLink(null)}>cancel</Button>
              <Button onClick={() => void navigator.clipboard.writeText(link.href).catch(() => {})}>
                copy link
              </Button>
              <a
                className="wm-button primary"
                href={link.href}
                rel="noopener noreferrer"
                target="_blank"
                onClick={() => setLink(null)}
              >
                open link
              </a>
            </div>
          </>
        )}
      </Modal>
      {message.quote && (
        <details className="wm-quote wm-content-quote">
          <summary>show quoted message</summary>
          <MessageFrame
            title={`quoted message ${index + 1}`}
            html={message.quote}
            render={message.quoteRender}
            assets={assets}
            light={light}
            fontSize={14}
            onMailto={mailto}
            onLink={inspectLink}
          />
        </details>
      )}
    </>
  );
}
