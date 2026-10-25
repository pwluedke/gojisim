import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Board.module.css";

/** The tip's width cap (px), as `.tooltip`'s max-width; used to keep it on screen. */
const MAX_WIDTH = 280;

/**
 * The app's tooltip (M5h): the change chips' hover-list style, shown while the element is
 * hovered or focused. No browser `title` tooltips (Monarch, M5h-1 review). The tip is drawn in a
 * top-level layer at a fixed position, so a scrolling panel (the battle log) never clips it, and
 * it stays inside the window: below the element, or above when there's no room below.
 */
export function Tooltip({
  tip,
  children,
  testId,
  className,
}: {
  tip: ReactNode;
  children: ReactNode;
  testId?: string | undefined;
  className?: string | undefined;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; above: boolean } | null>(
    null,
  );
  const show = () => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return;
    const above = box.bottom + 120 > window.innerHeight;
    setAt({
      x: Math.max(4, Math.min(box.left, window.innerWidth - MAX_WIDTH - 4)),
      y: above ? box.top - 2 : box.bottom + 2,
      above,
    });
  };
  return (
    <span
      ref={host}
      className={`${styles.tooltipHost}${className ? ` ${className}` : ""}`}
      data-testid={testId}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={() => setAt(null)}
      onFocus={show}
      onBlur={() => setAt(null)}
    >
      {children}
      {at &&
        createPortal(
          <span
            className={`gojisim ${styles.tooltip}`}
            role="tooltip"
            data-testid="tooltip"
            style={{
              left: at.x,
              top: at.y,
              translate: at.above ? "0 -100%" : undefined,
            }}
          >
            {tip}
          </span>,
          document.body,
        )}
    </span>
  );
}
