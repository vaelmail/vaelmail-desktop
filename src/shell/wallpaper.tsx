import { useEffect, useRef } from "react";

const glintRadius = 84;
const glintStrength = 0.7;

export function Wallpaper() {
  const root = useRef<HTMLDivElement>(null);
  const stars = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const surface = root.current?.parentElement;
    const sky = stars.current;
    if (!surface || !sky) return;

    const glints = Array.from(sky.querySelectorAll<SVGPathElement>("path"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;

    const reset = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      for (const star of glints) star.style.opacity = "0";
    };

    const move = (event: PointerEvent) => {
      const inactive =
        document.hidden ||
        reducedMotion.matches ||
        !finePointer.matches ||
        event.pointerType !== "mouse" ||
        event.buttons !== 0;
      if (inactive) {
        reset();
        return;
      }
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        for (const star of glints) {
          const box = star.getBoundingClientRect();
          const distance = Math.hypot(
            event.clientX - box.left - box.width / 2,
            event.clientY - box.top - box.height / 2,
          );
          star.style.opacity = String(Math.max(0, 1 - distance / glintRadius) * glintStrength);
        }
      });
    };

    surface.addEventListener("pointermove", move, { passive: true });
    surface.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      reset();
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);

  return (
    <div ref={root} className="v98-wallpaper" aria-hidden="true">
      <div className="v98-wallpaper-scene" />
      <svg
        ref={stars}
        className="v98-wallpaper-stars"
        viewBox="0 0 1586 992"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <path d="M1053 66h2v6h-2zM1051 68h6v2h-6z" />
        <path d="M873 217h2v6h-2zM871 219h6v2h-6z" />
        <path d="M1269 15h2v4h-2zM1268 16h4v2h-4z" />
      </svg>
    </div>
  );
}
