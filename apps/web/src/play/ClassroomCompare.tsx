import type { ClassroomRating } from "@gojisim/engine";
import { useEffect, useState } from "react";
import { MAX_REPORT_LENGTH } from "../game/collection";
import styles from "./Board.module.css";
import { FloatingWindow } from "./FloatingWindow";

/**
 * Kaiju Classroom (#365): the player's turn and the bot's own turn side by side, where their end
 * positions differ, and the player's rating of the bot's turn. Worse and Better ask why: with the
 * Test Site and sharing on, `onReport` opens the Bad Bot! / Good Bot! popup, which files the report
 * like the in-game buttons; otherwise the why is kept with the turn in the record.
 */
export function ClassroomCompare({
  playerMoves,
  botMoves,
  differences,
  canReport,
  onRate,
  onReport,
}: {
  playerMoves: readonly string[];
  botMoves: readonly string[];
  /** The differences in plain words ("Bot's hand"). */
  differences: readonly string[];
  canReport: boolean;
  onRate: (rating: ClassroomRating, reason?: string) => void;
  onReport: (kind: "worse" | "better") => void;
}) {
  const [asking, setAsking] = useState<"worse" | "better" | null>(null);
  const [why, setWhy] = useState("");
  // Paul, Nov 15-16: a FloatingWindow, so Hide folds it to a tab and the board can be looked at
  // (hover previews); it stays mounted, so the rating step and the typed "why" are kept. The
  // game still waits for the rating (the board stays locked while the comparison is open).
  const pick = (rating: "worse" | "better") =>
    canReport ? onReport(rating) : setAsking(rating);
  const column = (title: string, moves: readonly string[], testId: string) => (
    <div className={styles.classroomColumn}>
      <div className={styles.classroomTitle}>{title}</div>
      <ol data-testid={testId}>
        {moves.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ol>
    </div>
  );
  return (
    <FloatingWindow
      title="Kaiju Classroom: the bot played its turn differently"
      tabLabel="Kaiju Classroom: rate the bot's turn"
      testId="classroom-compare"
      className={styles.classroomModal}
    >
      <div className={styles.classroomColumns}>
        {column("Your turn", playerMoves, "classroom-player-moves")}
        {column("The bot's turn", botMoves, "classroom-bot-moves")}
      </div>
      <p data-testid="classroom-differences">
        Different at the end of the main phase: {differences.join(", ")}.
      </p>
      {asking === null ? (
        <>
          <p>How was the bot&apos;s turn, next to yours?</p>
          <div className={styles.modalButtons}>
            <button
              type="button"
              className={styles.button}
              data-testid="classroom-rate-aboutSame"
              onClick={() => onRate("aboutSame")}
            >
              About the same
            </button>
            <button
              type="button"
              className={styles.button}
              data-testid="classroom-rate-worse"
              onClick={() => pick("worse")}
            >
              Worse
            </button>
            <button
              type="button"
              className={styles.button}
              data-testid="classroom-rate-better"
              onClick={() => pick("better")}
            >
              Better
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (why.trim()) onRate(asking, why.trim());
          }}
        >
          <label className={styles.reportField}>
            {asking === "worse"
              ? "Why was the bot's turn worse?"
              : "Why was the bot's turn better?"}
            <textarea
              data-testid="classroom-why"
              rows={3}
              maxLength={MAX_REPORT_LENGTH}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
          <div className={styles.modalButtons}>
            <button
              type="submit"
              className={styles.button}
              data-testid="classroom-why-save"
              disabled={!why.trim()}
            >
              Save
            </button>
            <button
              type="button"
              className={styles.choiceButton}
              onClick={() => setAsking(null)}
            >
              Back
            </button>
          </div>
        </form>
      )}
    </FloatingWindow>
  );
}

/**
 * Kaiju Classroom (Paul, Nov 15): the bot's turn ended in the same position as the player's. The
 * same window as a difference, with Continue (or Space) to go on, which rates the turn "same";
 * Hide folds it to a bar like the comparison's, and the game waits until the player continues.
 */
export function ClassroomSame({ onContinue }: { onContinue: () => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      e.preventDefault();
      onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <FloatingWindow
      title="Kaiju Classroom: the same play"
      tabLabel="Kaiju Classroom: the bot made the same play you did"
      testId="classroom-same"
      className={styles.classroomModal}
      onHiddenChange={setHidden}
    >
      <p data-testid="classroom-same-text">
        The bot made the same play you did.
      </p>
      <p className={styles.muted}>Press Space to continue.</p>
      <div className={styles.modalButtons}>
        <button
          type="button"
          className={styles.button}
          data-testid="classroom-continue"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </FloatingWindow>
  );
}
