import { useEffect, useRef, useState } from "react";
import styles from "./Board.module.css";
import LINES from "./leaveLines.json";

/** The leave-game lines (#211), one picked at random each time; Paul edits `leaveLines.json`. */
export const LEAVE_LINES: readonly string[] = LINES;

/**
 * #211: the header's home link during a game in `/play` asks first, with a random funny line.
 * Stay and fight is the default (Esc too); Run away goes to `/`, leaving the game as leaving the
 * page does. The line uses `Math.random`, never the game's seed.
 */
export function LeaveGameModal({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  const [line] = useState(
    () => LEAVE_LINES[Math.floor(Math.random() * LEAVE_LINES.length)] ?? "",
  );
  const stay = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    stay.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onStay();
    };
    // Capture, so the board's own Esc handling never sees it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onStay]);
  return (
    <div className={styles.modalBackdrop} data-testid="leave-modal">
      <div
        className={styles.modal}
        role="alertdialog"
        aria-labelledby="leave-title"
        aria-describedby="leave-line"
      >
        <div className={styles.modalHeading} id="leave-title">
          Leave this game?
        </div>
        <p id="leave-line" data-testid="leave-line">
          {line}
        </p>
        <div className={styles.modalButtons}>
          <button
            ref={stay}
            type="button"
            className={styles.button}
            data-primary
            data-testid="leave-stay"
            onClick={onStay}
          >
            Stay and fight
          </button>
          <button
            type="button"
            className={styles.choiceButton}
            data-testid="leave-run"
            onClick={onLeave}
          >
            Run away
          </button>
        </div>
      </div>
    </div>
  );
}
