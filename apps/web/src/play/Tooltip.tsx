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
  const [box, setBox] = useState<DOMRect | null>(null);
  const show = () => setBox(host.current?.getBoundingClientRect() ?? null);
  return (
    <span
      ref={host}
      className={`${styles.tooltipHost}${className ? ` ${className}` : ""}`}
      data-testid={testId}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={() => setBox(null)}
      onFocus={show}
      onBlur={() => setBox(null)}
    >
      {children}
      {box && <TipBubble box={box} tip={tip} />}
    </span>
  );
}

/**
 * The tip itself, for an element at `box`: below it, or above when there's no room below, kept
 * inside the window. Also used on its own where wrapping the element would change the layout
 * (the board's "click to view" tips).
 */
export function TipBubble({ box, tip }: { box: DOMRect; tip: ReactNode }) {
  const above = box.bottom + 120 > window.innerHeight;
  return createPortal(
    <span
      className={`gojisim ${styles.tooltip}`}
      role="tooltip"
      data-testid="tooltip"
      style={{
        left: Math.max(
          4,
          Math.min(box.left, window.innerWidth - MAX_WIDTH - 4),
        ),
        top: above ? box.top - 2 : box.bottom + 2,
        translate: above ? "0 -100%" : undefined,
      }}
    >
      {tip}
    </span>,
    document.body,
  );
}
