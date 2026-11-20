import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiBytes } from "@/lib/bridge";
import { useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/mail/types";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import { Button } from "@/ui/controls";
export function AttachmentPreview({ file }: { file: Attachment }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [ready, setReady] = useState(false),
    [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let active = true;
    let loading: PDFDocumentLoadingTask | undefined;
    const controller = new AbortController();
    setError("");
    setText("");
    setReady(false);
    setPage(1);
    setPages(0);
    setPdfDoc(null);

    const load = async () => {
      try {
        const bytes = await apiBytes("/api/webmail/attachments/" + file.id).catch(() => {
          throw new Error("this attachment could not be loaded");
        });
        if (controller.signal.aborted) return;
        if (file.type === "text/plain") {
          const value = new TextDecoder().decode(bytes);
          if (active) {
            setText(value);
            setReady(true);
          }
          return;
        }
        if (file.type !== "application/pdf") return;
        const pdf = await import("pdfjs-dist");
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdf.getDocument({
          data: new Uint8Array(bytes),
        });
        loading = task;
        const document = await task.promise;
        if (!active) {
          await task.destroy();
          return;
        }
        setPdfDoc(document);
        setPages(document.numPages);
      } catch (e) {
        if (active && !(e instanceof DOMException && e.name === "AbortError"))
          setError((e as Error).message);
      }
    };

    if (["text/plain", "application/pdf"].includes(file.type)) void load();
    return () => {
      active = false;
      controller.abort();
      void loading?.destroy().catch(() => {});
    };
  }, [file.id, file.type]);

  useEffect(() => {
    if (!pdfDoc) return;
    let active = true;
    let cancelRender: (() => void) | undefined;
    setReady(false);

    const renderPage = async () => {
      try {
        const sheet = await pdfDoc.getPage(page);
        const base = sheet.getViewport({ scale: 1 });
        const viewport = sheet.getViewport({
          scale: Math.min(1.5, 900 / base.width, 1200 / base.height),
        });
        const target = canvas.current;
        if (!active || !target) return;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        const render = sheet.render({ canvas: target, viewport });
        cancelRender = () => render.cancel();
        await render.promise;
        if (active) setReady(true);
      } catch (e) {
        if (active && !(e instanceof Error && e.name === "RenderingCancelledException"))
          setError((e as Error).message);
      }
    };

    void renderPage();
    return () => {
      active = false;
      cancelRender?.();
    };
  }, [pdfDoc, page]);
  if (error)
    return (
      <p role="alert" className="wm-field-error">
        {error}. you can still download this file.
      </p>
    );
  if (file.type === "application/pdf")
    return (
      <div className="wm-pdf-preview">
        {!ready && <p role="status">opening document…</p>}
        <canvas ref={canvas} role="img" aria-label={file.name + ", page " + page} />
        <div className="wm-row">
          <Button
            disabled={page <= 1}
            onClick={() => {
              setReady(false);
              setPage((p) => p - 1);
            }}
          >
            previous
          </Button>
          <span>
            page {page} of {pages || "…"}
          </span>
          <Button
            disabled={page >= pages}
            onClick={() => {
              setReady(false);
              setPage((p) => p + 1);
            }}
          >
            next
          </Button>
        </div>
      </div>
    );
  if (file.type === "text/plain")
    return ready ? (
      <pre className="wm-text-preview">{text}</pre>
    ) : (
      <p role="status">opening text…</p>
    );
  if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type))
    return (
      <div
        className="wm-image-preview"
        role="img"
        aria-label={file.name}
        style={{
          backgroundImage: "url(/api/webmail/attachments/" + file.id + "/preview)",
        }}
      />
    );
  return <p className="wm-muted">download this attachment to view it.</p>;
}
