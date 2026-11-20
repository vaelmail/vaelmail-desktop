import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { applications, layers, type Bounds } from "@/lib/desktop/registry";
import { canSnap, snapBounds, type ResizeEdge } from "@/lib/desktop/windows";
import { RetroMenu } from "@/ui/retro98";
import { WindowGuardContext, type WindowGuard } from "./close-guard";
import { AppIcon } from "./icons";
import { navigationGuards, useDesktop } from "./store";
import { useWindowGestures } from "./use-window-gestures";

const resizeEdges: ResizeEdge[] = ["n", "e", "s", "w", "ne", "se", "sw", "nw"];
const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

type KeyboardMode = "move" | "size" | null;

function arrowDelta(key: string, step: number): [number, number] {
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return [dx, dy];
}

export const WindowFrame = memo(function WindowFrame({
  id,
  children,
  beforeClose,
  onClosed,
}: {
  id: string;
  children: ReactNode;
  beforeClose?: () => Promise<void>;
  onClosed?: () => void;
}) {
  const record = useDesktop((state) => state.windows.find((window) => window.id === id));
  const active = useDesktop((state) => state.active === id);
  const order = useDesktop((state) => state.windows.findIndex((window) => window.id === id));
  const viewport = useDesktop((state) => state.viewport);
  const dispatch = useDesktop((state) => state.dispatch);

  const frame = useRef<HTMLElement>(null);
  const closePending = useRef(false);
  const keyboardOrigin = useRef<Bounds | null>(null);
  const [guards] = useState(() => new Set<WindowGuard>());
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [keyboard, setKeyboard] = useState<KeyboardMode>(null);
  const labelId = useId();
  const { snapPreview, handlers } = useWindowGestures(record, frame);

  useEffect(() => {
    if (active && !frame.current?.contains(document.activeElement)) {
      frame.current?.focus({ preventScroll: true });
    }
  }, [active]);

  useEffect(() => {
    const run = async () => {
      for (const guard of guards) await guard();
    };
    navigationGuards.set(id, run);
    return () => {
      if (navigationGuards.get(id) === run) navigationGuards.delete(id);
    };
  }, [guards, id]);

  if (!record) return null;

  const definition = applications[record.appId];
  const title = record.title ?? definition.title;
  const maximized = record.mode === "maximized";
  const minimized = record.mode === "minimized";
  const snappable = canSnap(viewport, record.appId);

  const close = async () => {
    if (closePending.current) return;
    closePending.current = true;
    setClosing(true);
    setError("");
    try {
      for (const guard of guards) await guard();
      await beforeClose?.();
      dispatch({ type: "close", id });
      onClosed?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save. Retry closing after saving your changes.",
      );
    } finally {
      closePending.current = false;
      setClosing(false);
    }
  };

  const beginKeyboard = (mode: Exclude<KeyboardMode, null>) => {
    keyboardOrigin.current = record.bounds;
    setKeyboard(mode);
    dispatch({ type: "activate", id });
    requestAnimationFrame(() => frame.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.altKey &&
      event.shiftKey &&
      ["ArrowLeft", "ArrowRight", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      if (event.key === "ArrowDown") dispatch({ type: "restore", id });
      else dispatch({ type: "snap", id, side: event.key === "ArrowLeft" ? "left" : "right" });
      return;
    }
    if (event.altKey && event.key === "F10") {
      event.preventDefault();
      dispatch({ type: "maximize", id });
      return;
    }
    if (!keyboard) return;
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      if (event.key === "Escape" && keyboardOrigin.current) {
        dispatch({ type: "bounds", id, bounds: keyboardOrigin.current });
      }
      setKeyboard(null);
      return;
    }
    if (!arrowKeys.includes(event.key)) return;
    event.preventDefault();
    const [dx, dy] = arrowDelta(event.key, event.shiftKey ? 1 : 10);
    const { bounds } = record;
    dispatch({
      type: "bounds",
      id,
      bounds:
        keyboard === "move"
          ? { ...bounds, x: bounds.x + dx, y: bounds.y + dy }
          : { ...bounds, width: bounds.width + dx, height: bounds.height + dy },
    });
  };

  const style: CSSProperties = {
    left: record.bounds.x,
    top: record.bounds.y,
    width: record.bounds.width,
    height: record.bounds.height,
    zIndex: layers.window + order,
  };

  const preview = snapPreview && snapPreview !== "top" ? snapBounds(viewport, snapPreview) : null;

  return (
    <>
      {snapPreview && (
        <div
          className="v98-snap-preview"
          aria-hidden
          style={
            preview
              ? {
                  left: preview.x + 4,
                  top: 4,
                  width: preview.width - 8,
                  height: preview.height - 8,
                }
              : { inset: 4 }
          }
        />
      )}
      <section
        ref={frame}
        className="window v98-desktop-window"
        style={style}
        hidden={minimized}
        inert={minimized}
        data-active={active}
        data-maximized={maximized}
        data-keyboard={keyboard !== null}
        tabIndex={-1}
        aria-labelledby={labelId}
        aria-busy={closing || undefined}
        onPointerDownCapture={() => {
          if (!active) dispatch({ type: "activate", id });
        }}
        onFocusCapture={() => {
          if (!active) dispatch({ type: "activate", id });
        }}
        onBlur={(event) => {
          const leaving =
            event.currentTarget.contains(event.target) &&
            !event.currentTarget.contains(event.relatedTarget as Node | null);
          if (keyboard && leaving) {
            keyboardOrigin.current = null;
            setKeyboard(null);
          }
        }}
        onKeyDown={onKeyDown}
      >
        <div
          className={`title-bar${active ? "" : " inactive"}`}
          {...handlers(null)}
          onDoubleClick={(event) => {
            if (!(event.target as HTMLElement).closest("button"))
              dispatch({ type: "maximize", id });
          }}
        >
          <AppIcon icon={definition.icon} size={17} />
          <h2 id={labelId} className="title-bar-text">
            {title}
          </h2>
          <div className="v98-window-menu">
            <RetroMenu
              label={`Window options for ${title}`}
              finalFocus={frame}
              items={[
                {
                  id: "move",
                  label: "Move with arrow keys",
                  disabled: maximized,
                  onSelect: () => beginKeyboard("move"),
                },
                {
                  id: "size",
                  label: "Size with arrow keys",
                  disabled: maximized,
                  onSelect: () => beginKeyboard("size"),
                },
                {
                  id: "snap-left",
                  label: "Snap left · Alt+Shift+Left",
                  disabled: !snappable,
                  onSelect: () => dispatch({ type: "snap", id, side: "left" }),
                },
                {
                  id: "snap-right",
                  label: "Snap right · Alt+Shift+Right",
                  disabled: !snappable,
                  onSelect: () => dispatch({ type: "snap", id, side: "right" }),
                },
                {
                  id: "unsnap",
                  label: "Restore window size",
                  disabled: !record.snapped && !maximized,
                  onSelect: () => dispatch({ type: "restore", id }),
                },
                {
                  id: "reset",
                  label: "Reset window layout",
                  onSelect: () => dispatch({ type: "reset" }),
                },
              ]}
            />
          </div>
          <div className="title-bar-controls">
            <button
              type="button"
              aria-label={`Minimize ${title}`}
              onClick={() => dispatch({ type: "minimize", id })}
            >
              <span aria-hidden className="v98-caption-glyph">
                _
              </span>
            </button>
            <button
              type="button"
              aria-label={`${maximized ? "Restore" : "Maximize"} ${title}`}
              onClick={() => dispatch({ type: "maximize", id })}
            >
              <span aria-hidden className="v98-caption-glyph">
                {maximized ? "▣" : "□"}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Close ${title}`}
              disabled={closing}
              onClick={() => void close()}
            >
              <span aria-hidden className="v98-caption-glyph">
                ×
              </span>
            </button>
          </div>
        </div>
        {keyboard && (
          <div className="v98-window-feedback" role="status">
            Arrow keys to {keyboard}. Shift for fine adjustments. Enter to finish; Escape to cancel.
          </div>
        )}
        {error && (
          <div className="v98-window-feedback" role="alert">
            {error}
          </div>
        )}
        <WindowGuardContext.Provider value={guards}>
          <div className="v98-window-content">{children}</div>
        </WindowGuardContext.Provider>
        {!maximized &&
          resizeEdges.map((edge) => (
            <div
              key={edge}
              className={`v98-resize-edge v98-resize-${edge}${edge === "se" ? " v98-resize-grip" : ""}`}
              data-resize-edge={edge}
              aria-hidden
              {...handlers(edge)}
            />
          ))}
      </section>
    </>
  );
});
