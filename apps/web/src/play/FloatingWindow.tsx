import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./Board.module.css";

/** Where a window's top left corner sits, kept inside the viewport. */
interface Spot {
  x: number;
  y: number;
}

/** `spot` moved so a `width` × `height` box stays inside the viewport. */
function clamp(spot: Spot, width: number, height: number): Spot {
  return {
    x: Math.min(Math.max(0, spot.x), Math.max(0, window.innerWidth - width)),
    y: Math.min(Math.max(0, spot.y), Math.max(0, window.innerHeight - height)),
  };
}

/**
 * A window over the board that leaves the board usable (Paul, Nov 15): no backdrop, so the board's
 * cards keep their hover previews and clicks; dragged by its title bar, always inside the viewport;
 * Hide folds it to a small tab and the tab brings it back. Its content stays mounted while hidden,
 * so typed text is kept. It opens centered.
 */
export function FloatingWindow({
  title,
  tabLabel,
  testId,
  className,
  children,
}: {
  /** The title bar's text; the bar is the drag handle. */
  title: ReactNode;
  /** The hidden tab's text. */
  tabLabel: string;
  /** The window's `data-testid`. */
  testId: string;
  /** The window's own class (its width and layout). */
  className?: string | undefined;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [hidden, setHidden] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // A smaller window keeps it inside the viewport.
  useEffect(() => {
    const onResize = () =>
      setSpot((s) => {
        const el = box.current;
        return s && el ? clamp(s, el.offsetWidth, el.offsetHeight) : s;
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el || e.button !== 0) return;
    // The title bar's own buttons (Hide) click as buttons.
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setSpot({ x: rect.left, y: rect.top });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = box.current;
    const d = drag.current;
    if (!el || !d) return;
    setSpot(
      clamp(
        { x: e.clientX - d.dx, y: e.clientY - d.dy },
        el.offsetWidth,
        el.offsetHeight,
      ),
    );
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return (
    <>
      {hidden && (
        <button
          type="button"
          className={styles.floatingTab}
          data-testid="window-show"
          onClick={() => setHidden(false)}
        >
          {tabLabel} · Show
        </button>
      )}
      <div
        ref={box}
        className={`${styles.modal} ${styles.floatingWindow} ${className ?? ""}`}
        data-testid={testId}
        data-moved={spot ? "true" : undefined}
        hidden={hidden}
        style={spot ? { left: spot.x, top: spot.y, translate: "none" } : {}}
      >
        <div
          className={`${styles.modalHeading} ${styles.floatingTitle}`}
          data-testid="window-title"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span>{title}</span>
          <button
            type="button"
            className={styles.choiceButton}
            data-testid="window-hide"
            title="Hide this to look at the board; what you typed is kept"
            onClick={() => setHidden(true)}
          >
            Hide
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
