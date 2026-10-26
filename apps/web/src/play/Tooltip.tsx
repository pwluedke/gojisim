import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Board.module.css";

/** The gap between the element and its tip, and the tip's least distance from the window's edge. */
const GAP = 2;
const EDGE = 4;

/**
 * The app's tooltip (M5h): the change chips' hover-list style, shown while the element is
 * hovered or focused. No browser `title` tooltips (Monarch, M5h-1 review). The tip is drawn in a
 * top-level layer at a fixed position, so a scrolling panel (the battle log) never clips it, and
 * it stays inside the window: below the element, or above when there's no room below. It is only
 * as tall as its text.
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
 * The tip itself, for an element at `box`: below it, or above when it would cross the window's
 * bottom edge, kept inside the window either way. It is measured once drawn, so a tall tip flips
 * too. Also used on its own where wrapping the element would change the layout (the board's
 * "click to view" tips).
 */
export function TipBubble({ box, tip }: { box: DOMRect; tip: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<"below" | "above" | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: width, offsetHeight: height } = el;
    const fitsBelow = box.bottom + GAP + height <= window.innerHeight - EDGE;
    el.style.top = `${
      fitsBelow ? box.bottom + GAP : Math.max(EDGE, box.top - GAP - height)
    }px`;
    el.style.left = `${Math.max(
      EDGE,
      Math.min(box.left, window.innerWidth - width - EDGE),
    )}px`;
    setPlacement(fitsBelow ? "below" : "above");
  }, [box, tip]);
  return createPortal(
    // `gojisim` carries the theme variables into the portal; the tooltip resets its page sizing.
    <span
      ref={ref}
      className={`gojisim ${styles.tooltip}`}
      role="tooltip"
      data-testid="tooltip"
      data-placement={placement ?? undefined}
      // Hidden until it is measured and placed, so it never flashes in the wrong spot.
      style={{
        left: box.left,
        top: box.bottom + GAP,
        visibility: placement ? undefined : "hidden",
      }}
    >
      {tip}
    </span>,
    document.body,
  );
}
