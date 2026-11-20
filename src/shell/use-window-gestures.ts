import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Bounds } from "@/lib/desktop/registry";
import {
  canSnap,
  constrainBounds,
  resizeBounds,
  type DesktopWindow,
  type ResizeEdge,
} from "@/lib/desktop/windows";
import { useDesktop } from "./store";

type Gesture = {
  pointerId: number;
  originX: number;
  originY: number;
  initial: Bounds;
  next: Bounds;
  resize: ResizeEdge | null;
  capture: HTMLElement;
};

export type SnapTarget = "left" | "right" | "top" | null;

const snapEdge = 18;
const topEdge = 10;

function paint(frame: HTMLElement | null, bounds: Bounds) {
  if (!frame) return;
  Object.assign(frame.style, {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
}

export function useWindowGestures(
  record: DesktopWindow | undefined,
  frame: RefObject<HTMLElement | null>,
) {
  const dispatch = useDesktop((state) => state.dispatch);
  const gesture = useRef<Gesture | null>(null);
  const snapTarget = useRef<SnapTarget>(null);
  const [snapPreview, setSnapPreview] = useState<SnapTarget>(null);

  const setSnap = (next: SnapTarget) => {
    if (snapTarget.current === next) return;
    snapTarget.current = next;
    setSnapPreview(next);
  };

  useEffect(() => {
    const cancel = () => {
      const drag = gesture.current;
      if (!drag) return;
      gesture.current = null;
      snapTarget.current = null;
      setSnapPreview(null);
      paint(frame.current, drag.initial);
      delete document.documentElement.dataset.vaelGesture;
      if (drag.capture.hasPointerCapture(drag.pointerId)) {
        drag.capture.releasePointerCapture(drag.pointerId);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, [frame]);

  const start = (event: PointerEvent<HTMLElement>, resize: ResizeEdge | null) => {
    if (!record || record.mode === "maximized") return;
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    if (!resize && (event.target as HTMLElement).closest("button,a,input")) return;
    dispatch({ type: "activate", id: record.id });
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.documentElement.dataset.vaelGesture = resize ?? "move";
    gesture.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      initial: record.bounds,
      next: record.bounds,
      resize,
      capture: event.currentTarget,
    };
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag || !record || drag.pointerId !== event.pointerId) return;
    const { viewport } = useDesktop.getState();
    const dx = event.clientX - drag.originX;
    const dy = event.clientY - drag.originY;

    if (drag.resize) {
      drag.next = resizeBounds(drag.initial, drag.resize, dx, dy, viewport, record.appId);
    } else {
      drag.next = constrainBounds(
        { ...drag.initial, x: drag.initial.x + dx, y: drag.initial.y + dy },
        viewport,
        record.appId,
      );
      const area = frame.current?.parentElement?.getBoundingClientRect();
      const x = event.clientX - (area?.left ?? 0);
      const y = event.clientY - (area?.top ?? 0);
      const snappable = canSnap(viewport, record.appId);
      if (y <= topEdge) setSnap("top");
      else if (snappable && x <= snapEdge) setSnap("left");
      else if (snappable && x >= viewport.width - snapEdge) setSnap("right");
      else setSnap(null);
    }
    paint(frame.current, drag.next);
  };

  const end = (event: PointerEvent<HTMLElement>, cancelled = false) => {
    const drag = gesture.current;
    if (!drag || !record || drag.pointerId !== event.pointerId) return;
    gesture.current = null;
    delete document.documentElement.dataset.vaelGesture;
    paint(frame.current, cancelled ? drag.initial : drag.next);
    if (!cancelled) {
      dispatch({ type: "bounds", id: record.id, bounds: drag.next });
      const target = snapTarget.current;
      if (!drag.resize && target === "top") dispatch({ type: "maximize", id: record.id });
      else if (!drag.resize && (target === "left" || target === "right")) {
        dispatch({ type: "snap", id: record.id, side: target });
      }
    }
    setSnap(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlers = (resize: ResizeEdge | null) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => start(event, resize),
    onPointerMove: move,
    onPointerUp: (event: PointerEvent<HTMLElement>) => end(event),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => end(event, true),
  });

  return { snapPreview, handlers };
}
