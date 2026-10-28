import { useEffect, useState } from "react";
import { firstSecondArt } from "../game/officialArt";
import type { Session } from "../game/session";
import board from "./Board.module.css";
import styles from "./NewGame.module.css";
import { useViewBoard, ViewBoardBanner, ViewBoardButton } from "./ViewBoard";

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
 *
 * Tester fixes 1: face up, the cards show the official First / Second fronts, one of the two
 * of each kind picked by the game's seed (`firstSecondArt`); a front whose image doesn't load
 * shows the drawn face. The heading says what the pick decides (6.3.1.4).
 */
export function FirstPick({
  seed,
  picker,
  firstCard,
  canPeek,
  build,
  onStart,
}: {
  /** The game's seed: it picks which official fronts show. */
  seed: number;
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
  // Fronts whose image failed to load (none made yet, or CI): drawn faces instead.
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const art = firstSecondArt(seed);
  const view = useViewBoard();
  const goesFirst = picked?.card === firstCard;
  const face = (card: 0 | 1) => (card === firstCard ? "First" : "Second");
  const shown = picked !== null || peeking;
  const pick = (card: 0 | 1) => {
    setPeeking(false);
    setPicked({ card, session: build(card, peeked) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view.viewing) return;
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
    <div
      className={view.viewing ? board.modalBackdropHidden : board.modalBackdrop}
      data-testid="first-pick-backdrop"
      data-viewing-board={view.viewing ? "true" : undefined}
    >
      {view.viewing && <ViewBoardBanner onReturn={view.toggle} />}
      <div
        className={board.modal}
        style={view.viewing ? { visibility: "hidden" } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-pick-title"
        data-testid="first-pick"
        data-picker={picker}
        data-peeking={peeking ? "true" : "false"}
      >
        <ViewBoardButton onClick={view.toggle} />
        <h2 id="first-pick-title" className={board.modalHeading}>
          Pick a card. It decides who goes first.
        </h2>
        <p>
          {picked
            ? `You go ${goesFirst ? "first" : "second"}.`
            : "One card is First, the other is Second. Pick one (1 or 2)."}
        </p>
        <div className={styles.pickCards}>
          {([0, 1] as const).map((card) => {
            const src = art[face(card)];
            const image = shown && !missing.has(src);
            return (
              <button
                key={card}
                type="button"
                className={
                  image
                    ? `${styles.pickFace} ${styles.pickArt}`
                    : shown
                      ? styles.pickFace
                      : styles.pickBack
                }
                data-testid={`first-pick-card-${card}`}
                data-face={shown ? face(card) : undefined}
                data-picked={picked?.card === card ? "true" : undefined}
                disabled={picked !== null}
                onClick={() => pick(card)}
              >
                {image ? (
                  <img
                    src={src}
                    alt={face(card)}
                    data-testid="first-pick-art"
                    onError={() => setMissing((now) => new Set(now).add(src))}
                  />
                ) : shown ? (
                  face(card)
                ) : (
                  card + 1
                )}
              </button>
            );
          })}
        </div>
        {canPeek && !picked && (
          <p className={styles.peekHint} data-testid="first-pick-peek-hint">
            Casual: hold {PEEK_KEY === "Meta" ? "Cmd" : "Ctrl"} to see the
            fronts and choose.
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
