import type { ClassroomRating } from "@gojisim/engine";
import { useState } from "react";
import { MAX_REPORT_LENGTH } from "../game/collection";
import styles from "./Board.module.css";

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
  // Paul, Nov 15: Hide folds the modal to a bar so the board can be looked at (hover previews);
  // the component stays mounted, so the rating step and the typed "why" are kept. The game
  // still waits for the rating (the board stays locked while the comparison is open).
  const [hidden, setHidden] = useState(false);
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
  if (hidden)
    return (
      <div className={styles.classroomBar} data-testid="classroom-bar">
        Kaiju Classroom: rate the bot&apos;s turn ·{" "}
        <button
          type="button"
          className={styles.button}
          data-testid="classroom-show"
          onClick={() => setHidden(false)}
        >
          Show
        </button>
      </div>
    );
  return (
    <div className={styles.modalBackdrop} data-testid="classroom-compare">
      <div className={`${styles.modal} ${styles.classroomModal}`}>
        <div className={styles.modalHeading}>
          Kaiju Classroom: the bot played its turn differently
          <button
            type="button"
            className={styles.choiceButton}
            data-testid="classroom-hide"
            title="Hide this to look at the board; the game waits for your rating"
            onClick={() => setHidden(true)}
          >
            Hide
          </button>
        </div>
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
      </div>
    </div>
  );
}
