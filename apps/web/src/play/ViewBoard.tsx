import { useEffect, useState } from "react";
import styles from "./Board.module.css";

/**
 * "View board" for every choice, search and pick modal (Tester fixes 1): the heading's button or
 * B hides the modal, so the board can be looked at (and its cards previewed); the button, B or
 * Esc brings it back. While the board shows, a small banner says a choice is still open.
 */
export function useViewBoard(): {
  viewing: boolean;
  toggle: () => void;
} {
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setViewing((v) => !v);
      } else if (e.key === "Escape" && viewing) {
        // Esc returns to the modal first; nothing else closes meanwhile.
        e.preventDefault();
        e.stopImmediatePropagation();
        setViewing(false);
      }
    };
    // Capture: the modal's own Esc (clear a selection) and the screen's wait their turn.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return { viewing, toggle: () => setViewing((v) => !v) };
}

/** The heading's "View board [B]" button. */
export function ViewBoardButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.viewBoardButton}
      data-testid="view-board"
      onClick={onClick}
    >
      View board [B]
    </button>
  );
}

/** The banner shown while the board is viewed with a modal open. */
export function ViewBoardBanner({ onReturn }: { onReturn: () => void }) {
  return (
    <div className={styles.viewBoardBanner} data-testid="view-board-banner">
      Choice open:{" "}
      <button
        type="button"
        className={styles.choiceButton}
        data-testid="view-board-return"
        onClick={onReturn}
      >
        Return [B]
      </button>
    </div>
  );
}
