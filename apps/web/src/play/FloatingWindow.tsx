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
 * so typed text is kept. It opens centered. Paul, Nov 16: every window over the board uses it; one
 * the game waits on (a forced choice) still blocks the game, it just doesn't cover the board.
 */
export function FloatingWindow({
  title,
  tabLabel,
  testId,
  className,
  alert = false,
  labelledBy,
  describedBy,
  attrs,
  onHiddenChange,
  bare = false,
  backdrop = false,
  onBackdrop,
  zIndex,
  children,
}: {
  /** The title bar's text; the bar is the drag handle. */
  title?: ReactNode;
  /** The hidden tab's text. */
  tabLabel?: string;
  /** The window's `data-testid`. */
  testId: string;
  /** The window's own class (its width and layout). */
  className?: string | undefined;
  /** An alert dialog (a question that must be answered), not a plain dialog. */
  alert?: boolean;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  /** More attributes on the window (`data-kind`, `data-area`), as before on the modal's backdrop. */
  attrs?: Record<string, string | undefined>;
  /** Told when Hide or the tab hides or shows it (a window's own keys wait while it's hidden). */
  onHiddenChange?: (hidden: boolean) => void;
  /**
   * A window with its own look and header (the Deckbuilder's): no title bar, Hide or modal frame
   * of ours; an element of its own marked `data-drag-handle` (its header) is the handle.
   */
  bare?: boolean;
  /**
   * Off the board (the Deckbuilder, the new-game screen), the page behind stays dimmed and blocked
   * as before; on the board there is none (Paul, Nov 15-16), so the board stays usable.
   */
  backdrop?: boolean;
  /** A click on that backdrop (outside the window), e.g. to close it. */
  onBackdrop?: (() => void) | undefined;
  /** The window's layer, where the page has its own (the Deckbuilder's windows are 50). */
  zIndex?: number | undefined;
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
    // A drag starts on a handle (the title bar, or a bare window's own header), never on a
    // control in it (Hide, Close, a field).
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drag-handle]")) return;
    if (target.closest("button, input, select, textarea, a, label")) return;
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
      {backdrop && (
        <div
          className={styles.floatingBackdrop}
          data-testid={`${testId}-backdrop`}
          style={zIndex === undefined ? undefined : { zIndex: zIndex - 1 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onBackdrop?.();
          }}
        />
      )}
      {hidden && (
        <button
          type="button"
          className={styles.floatingTab}
          data-testid="window-show"
          onClick={() => {
            setHidden(false);
            onHiddenChange?.(false);
          }}
        >
          {tabLabel} · Show
        </button>
      )}
      <div
        ref={box}
        className={`${bare ? "" : styles.modal} ${styles.floatingWindow} ${className ?? ""}`}
        {...attrs}
        role={alert ? "alertdialog" : "dialog"}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        data-testid={testId}
        data-moved={spot ? "true" : undefined}
        hidden={hidden}
        style={{
          ...(spot ? { left: spot.x, top: spot.y, translate: "none" } : {}),
          ...(zIndex === undefined ? {} : { zIndex }),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!bare && (
          <div
            className={`${styles.modalHeading} ${styles.floatingTitle}`}
            data-testid="window-title"
            data-drag-handle
          >
            <span>{title}</span>
            {/* Off the board (a backdrop) there's nothing to look at behind it: no Hide. */}
            {!backdrop && (
              <button
                type="button"
                className={styles.choiceButton}
                data-testid="window-hide"
                title="Hide this to look at the board; what you typed is kept"
                onClick={() => {
                  setHidden(true);
                  onHiddenChange?.(true);
                }}
              >
                Hide
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
