import { useEffect, useState } from "react";
import type { Session } from "../game/session";
import board from "./Board.module.css";
import styles from "./NewGame.module.css";

/** The key that peeks: Cmd on a Mac, Ctrl on Windows and Linux. */
const PEEK_KEY =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? "Meta"
    : "Control";

/**
 * The First / Second pick (M5e), as a modal over the board (Monarch, Oct 26, 2026): the mats are
 * drawn with the decks in place (6.3.1.3), and two face-down cards, one First and one Second, wait
 * for the human. The seeded RNG shuffles them at 6.3.1.4, so which card reads First is known from
 * the game's seed (`firstCard`); `build` creates the game with the pick. In a Casual game, holding
 * Cmd (Ctrl on Windows and Linux) shows both cards face up while held, and the record notes the
 * peek; in a Tournament game the key does nothing. Once picked, both turn face up and the game
 * starts on Continue.
 */
export function FirstPick({
  picker,
  firstCard,
  canPeek,
  build,
  onStart,
}: {
  /** The seat that picks: the human, against a bot. */
  picker: string;
  /** The card (0 or 1) that reads First for `picker`. */
  firstCard: 0 | 1;
  /** Casual games may peek; Tournament games may not. */
  canPeek: boolean;
  build: (card: 0 | 1, peeked: boolean) => Session;
  onStart: (session: Session) => void;
}) {
  const [picked, setPicked] = useState<{
    card: 0 | 1;
    session: Session;
  } | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [peeked, setPeeked] = useState(false);
  const goesFirst = picked?.card === firstCard;
  const face = (card: 0 | 1) => (card === firstCard ? "First" : "Second");
  const shown = picked !== null || peeking;
  const pick = (card: 0 | 1) => {
    setPeeking(false);
    setPicked({ card, session: build(card, peeked) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === PEEK_KEY) {
        if (canPeek && !picked) {
          setPeeking(true);
          setPeeked(true);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!picked && (e.key === "1" || e.key === "2")) {
        pick(e.key === "1" ? 0 : 1);
      } else if (picked && e.key === " ") {
        e.preventDefault();
        onStart(picked.session);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === PEEK_KEY) setPeeking(false);
    };
    // A key released outside the window never sends keyup.
    const onBlur = () => setPeeking(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  });

  return (
    <div className={board.modalBackdrop} data-testid="first-pick-backdrop">
      <div
        className={board.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-pick-title"
        data-testid="first-pick"
        data-picker={picker}
        data-peeking={peeking ? "true" : "false"}
      >
        <h2 id="first-pick-title" className={board.modalHeading}>
          Pick First or Second
        </h2>
        <p>
          {picked
            ? `You go ${goesFirst ? "first" : "second"}.`
            : "One card is First, the other is Second. Pick one (1 or 2)."}
        </p>
        <div className={styles.pickCards}>
          {([0, 1] as const).map((card) => (
            <button
              key={card}
              type="button"
              className={shown ? styles.pickFace : styles.pickBack}
              data-testid={`first-pick-card-${card}`}
              data-face={shown ? face(card) : undefined}
              data-picked={picked?.card === card ? "true" : undefined}
              disabled={picked !== null}
              onClick={() => pick(card)}
            >
              {shown ? face(card) : card + 1}
            </button>
          ))}
        </div>
        {canPeek && !picked && (
          <p className={styles.note} data-testid="first-pick-peek-hint">
            Casual: hold {PEEK_KEY === "Meta" ? "Cmd" : "Ctrl"} to see both
            cards (the game record notes it).
          </p>
        )}
        {picked && (
          <div className={board.modalButtons}>
            <button
              type="button"
              className={styles.start}
              data-primary
              data-testid="first-pick-continue"
              onClick={() => onStart(picked.session)}
            >
              Continue [Space]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
