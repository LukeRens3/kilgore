"use client";

import { useCallback, useRef } from "react";

export interface SplitterProps {
  orientation: "vertical" | "horizontal";
  /** Current size of the pane before the splitter, in pixels. */
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
  /** Vertical splitters grow rightwards, horizontal ones grow upwards by default. */
  invert?: boolean;
}

const KEYBOARD_STEP = 24;

export default function Splitter({
  orientation,
  value,
  onChange,
  min,
  max,
  label,
  invert = false,
}: SplitterProps) {
  const start = useRef<{ pointer: number; size: number } | null>(null);

  const clamp = useCallback(
    (next: number) => Math.min(max, Math.max(min, next)),
    [min, max]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const origin = start.current;
      if (!origin) return;
      const pointer = orientation === "vertical" ? event.clientX : event.clientY;
      const delta = (pointer - origin.pointer) * (invert ? -1 : 1);
      onChange(clamp(origin.size + delta));
    },
    [orientation, invert, onChange, clamp]
  );

  const onPointerUp = useCallback(() => {
    start.current = null;
    document.body.classList.remove("is-resizing");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        start.current = {
          pointer: orientation === "vertical" ? event.clientX : event.clientY,
          size: value,
        };
        document.body.classList.add("is-resizing");
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
      }}
      onKeyDown={(event) => {
        const decrease = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
        const increase = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
        if (event.key === decrease) {
          event.preventDefault();
          onChange(clamp(value + (invert ? KEYBOARD_STEP : -KEYBOARD_STEP)));
        } else if (event.key === increase) {
          event.preventDefault();
          onChange(clamp(value + (invert ? -KEYBOARD_STEP : KEYBOARD_STEP)));
        }
      }}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}
