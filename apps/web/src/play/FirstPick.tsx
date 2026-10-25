import { useEffect, useState } from "react";
import type { Session } from "../game/session";
import styles from "./NewGame.module.css";

/**
 * The First / Second pick (M5e): two face-down cards, one First and one Second. The seeded RNG
 * shuffles them at 6.3.1.4, so `build` (which creates the game with the pick) decides what the
 * picked card says; then both turn face up and the game starts on Continue.
 */
export function FirstPick({
  picker,
  build,
  onStart,
}: {
  /** The seat that picks: the human, against a bot. */
  picker: string;
  build: (card: 0 | 1) => Session;
  onStart: (session: Session) => void;
}) {
  const [picked, setPicked] = useState<{
    card: 0 | 1;
    session: Session;
  } | null>(null);
  const goesFirst = picked?.session.states[0]?.firstPlayer === picker;
  const face = (card: 0 | 1) =>
    (card === picked?.card) === goesFirst ? "First" : "Second";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!picked && (e.key === "1" || e.key === "2")) {
        const card = e.key === "1" ? 0 : 1;
        setPicked({ card, session: build(card) });
      } else if (picked && e.key === " ") {
        e.preventDefault();
        onStart(picked.session);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className={styles.screen}
      data-testid="first-pick"
      data-picker={picker}
    >
      <h1 className={styles.title}>Pick First or Second</h1>
      <p>
        {picked
          ? `You go ${goesFirst ? "first" : "second"}.`
          : "One card is First, the other is Second. Pick one."}
      </p>
      <div className={styles.pickCards}>
        {([0, 1] as const).map((card) => (
          <button
            key={card}
            type="button"
            className={picked ? styles.pickFace : styles.pickBack}
            data-testid={`first-pick-card-${card}`}
            data-face={picked ? face(card) : undefined}
            data-picked={picked?.card === card ? "true" : undefined}
            disabled={picked !== null}
            onClick={() => setPicked({ card, session: build(card) })}
          >
            {picked ? face(card) : card + 1}
          </button>
        ))}
      </div>
      {picked && (
        <button
          type="button"
          className={styles.start}
          data-testid="first-pick-continue"
          onClick={() => onStart(picked.session)}
        >
          Continue [Space]
        </button>
      )}
    </div>
  );
}
