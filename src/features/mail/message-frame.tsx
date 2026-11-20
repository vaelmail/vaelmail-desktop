import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { bridge, frameUrl } from "@/lib/bridge";
import { native } from "@/lib/bridge/invoke";
import { messageDocument, validFrameEvent, validFrameResize } from "@/lib/mail/message-frame";
import type { EmailRender } from "@/lib/mail/types";
import { Button } from "@/ui/controls";
import { useQuery } from "@tanstack/react-query";
import { readerFontCss } from "@/lib/mail/reader-font";

type FrameProps = {
  html: string;
  light: boolean;
  fontSize: number;
  title: string;
  render?: EmailRender;
  assets?: Record<string, string>;
  onMailto?: (href: string) => void;
  onLink?: (link: { href: string; original: string; label: string; menu: boolean }) => void;
};
const noAssets: Record<string, string> = {};
export function MessageFrame(props: FrameProps) {
  return (
    <FrameSession
      key={
        props.html +
        (props.render?.html || "") +
        (props.render?.css || "") +
        props.light +
        props.fontSize
      }
      {...props}
    />
  );
}
function FrameSession({
  html,
  light,
  fontSize,
  title,
  render,
  assets = noAssets,
  onMailto,
  onLink,
}: FrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const font = useQuery({
    queryKey: ["reader-font"],
    queryFn: readerFontCss,
    staleTime: "static",
    retry: false,
  });
  const [token] = useState(() => crypto.randomUUID());
  const [height, setHeight] = useState(160);
  const [expanded, setExpanded] = useState(false);
  const assetsRef = useRef(assets);
  useLayoutEffect(() => {
    assetsRef.current = assets;
    frame.current?.contentWindow?.postMessage({ type: "vael:images", token, assets }, "*");
  }, [assets, token]);
  const measure = () =>
    frame.current?.contentWindow?.postMessage({ type: "vael:measure", token }, "*");
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      const measured = validFrameResize(event, frame.current?.contentWindow ?? null, token);
      if (measured !== null) setHeight(measured);
      if (
        validFrameEvent(event, frame.current?.contentWindow ?? null, token) &&
        event.data.type === "vael:ready"
      ) {
        frame.current?.contentWindow?.postMessage(
          { type: "vael:images", token, assets: assetsRef.current },
          "*",
        );
      }
      if (
        validFrameEvent(event, frame.current?.contentWindow ?? null, token) &&
        event.data.type === "vael:mailto" &&
        typeof event.data.href === "string" &&
        event.data.href.length <= 2000 &&
        event.data.href.startsWith("mailto:")
      )
        onMailto?.(event.data.href);
      if (
        validFrameEvent(event, frame.current?.contentWindow ?? null, token) &&
        event.data.type === "vael:link" &&
        typeof event.data.href === "string" &&
        event.data.href.length <= 8192 &&
        typeof event.data.original === "string" &&
        event.data.original.length <= 8192 &&
        typeof event.data.label === "string" &&
        event.data.label.length <= 2000
      )
        onLink?.({
          href: event.data.href,
          original: event.data.original,
          label: event.data.label,
          menu: event.data.menu === true,
        });
    };
    const request = () =>
      frame.current?.contentWindow?.postMessage({ type: "vael:measure", token }, "*");
    const details = frame.current?.closest("details");
    window.addEventListener("message", receive);
    details?.addEventListener("toggle", request);
    request();
    return () => {
      window.removeEventListener("message", receive);
      details?.removeEventListener("toggle", request);
    };
  }, [token, onMailto, onLink]);
  useLayoutEffect(() => {
    const beforePrint = () => {
      if (frame.current) frame.current.style.height = `${height}px`;
    };
    const afterPrint = () => {
      if (frame.current)
        frame.current.style.height = `${expanded ? height : Math.min(height, 2400)}px`;
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [height, expanded]);
  const document = useMemo(
    () => messageDocument(html, light, fontSize, token, title, font.data || "", render),
    [html, light, fontSize, token, title, font.data, render],
  );
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let published: string | undefined;
    let cancelled = false;
    const policy =
      /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(document)?.[1] ?? "";
    void bridge.desktop.frame.publish(document, policy).then(({ id }) => {
      published = id;
      if (cancelled) void bridge.desktop.frame.release(id);
      else if (native) setSource(frameUrl(id));
      else void import("@/lib/bridge/mock").then((mock) => setSource(mock.mockFrame(id)));
    });
    return () => {
      cancelled = true;
      if (published) void bridge.desktop.frame.release(published);
    };
  }, [document]);
  const limit = 2400;
  return (
    <div className="wm-frame">
      {height > limit && (
        <div className="wm-long-message">
          <span>{expanded ? "full message expanded" : "long message · more content below"}</span>
          <Button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "collapse message" : "expand full message"}
          </Button>
        </div>
      )}
      {source && (
        <iframe
          ref={frame}
          onLoad={measure}
          title={title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={source}
          style={{ height: expanded ? height : Math.min(height, limit) }}
        />
      )}
    </div>
  );
}
