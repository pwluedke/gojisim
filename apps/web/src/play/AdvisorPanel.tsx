import type { Action, AdviceReason, ClassroomAdvice } from "@gojisim/engine";
import { useState } from "react";
import type { Advice } from "../game/useAdvisor";
import styles from "./AdvisorPanel.module.css";

/** #478: what a rule did, in the panel's words. */
const EFFECT: Record<string, string> = {
  removed: "left out",
  forced: "forced",
  freed: "freed",
  favored: "favored",
  against: "argued against",
};

/** The refute reasons (Paul, Nov 18), in the order shown. */
export const REASONS: { value: AdviceReason; label: string }[] = [
  { value: "wrongCard", label: "Wrong card" },
  { value: "wrongZone", label: "Wrong zone" },
  { value: "wrongTiming", label: "Wrong timing" },
  { value: "other", label: "Other" },
];

const reasonLabel = (reason: AdviceReason | undefined) =>
  REASONS.find((r) => r.value === reason)?.label.toLowerCase();

const percent = (rate: number | null) =>
  rate === null ? "–" : `${Math.round(rate * 100)}%`;

/**
 * #478 (Bot Advisor, phase 2a): in a Kaiju Classroom game, at each of your decisions, the move
 * the bot would make in your seat, the moves it weighed and the rules behind it, with Agree or
 * Refute. Nothing is played for you. Below, this turn's answers.
 */
export function AdvisorPanel({
  advice,
  thinking,
  labelOf,
  answered,
  turnAnswers,
  onAnswer,
}: {
  advice: Advice | null;
  thinking: boolean;
  /** An action as the battle log words it, at the advised position. */
  labelOf: (action: Action) => string;
  /** Your answer at this decision, if you gave one. */
  answered: ClassroomAdvice | null;
  /** Your answers this turn, oldest first. */
  turnAnswers: ClassroomAdvice[];
  onAnswer: (
    answer: "agree" | "refute",
    reason?: AdviceReason,
    note?: string,
  ) => void;
}) {
  const [refuting, setRefuting] = useState(false);
  const [reason, setReason] = useState<AdviceReason>("wrongCard");
  const [note, setNote] = useState("");
  const agreed = turnAnswers.filter((a) => a.answer === "agree").length;
  return (
    <section className={styles.panel} data-testid="advisor">
      <h3 className={styles.title}>Advisor</h3>
      {!advice && thinking && (
        <p className={styles.muted} data-testid="advisor-thinking">
          The bot is thinking about your move…
        </p>
      )}
      {advice && (
        <>
          <p data-testid="advisor-pick">
            <strong>The bot would:</strong> {labelOf(advice.trace.pick)}
          </p>
          {advice.trace.alternatives.length > 1 && (
            <ol className={styles.list} data-testid="advisor-alternatives">
              {advice.trace.alternatives.map((a, i) => (
                <li key={i}>
                  {labelOf(a.action)}{" "}
                  <span className={styles.muted}>
                    ({percent(a.winRate)} to win, {a.visits} looks)
                  </span>
                </li>
              ))}
            </ol>
          )}
          {advice.trace.rules.length > 0 && (
            <ul className={styles.list} data-testid="advisor-rules">
              {advice.trace.rules.map((r, i) => (
                <li key={i}>
                  <strong>{r.id}</strong>{" "}
                  <span className={styles.muted}>
                    ({EFFECT[r.effect] ?? r.effect})
                  </span>
                  : {r.text}
                </li>
              ))}
            </ul>
          )}
          {answered ? (
            <p className={styles.muted} data-testid="advisor-answered">
              You{" "}
              {answered.answer === "agree"
                ? "agreed"
                : `refuted it (${reasonLabel(answered.reason)}${answered.note ? `: ${answered.note}` : ""})`}
              .
            </p>
          ) : refuting ? (
            <div className={styles.refute}>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as AdviceReason)}
                data-testid="advisor-reason"
                aria-label="Why"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {reason === "other" && (
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What should it do?"
                  data-testid="advisor-note"
                  aria-label="Your reason"
                />
              )}
              <button
                type="button"
                disabled={reason === "other" && note.trim() === ""}
                onClick={() => {
                  onAnswer(
                    "refute",
                    reason,
                    reason === "other" ? note.trim() : undefined,
                  );
                  setRefuting(false);
                  setNote("");
                }}
                data-testid="advisor-send"
              >
                Send
              </button>
              <button type="button" onClick={() => setRefuting(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.buttons}>
              <button
                type="button"
                onClick={() => onAnswer("agree")}
                data-testid="advisor-agree"
              >
                Agree
              </button>
              <button
                type="button"
                onClick={() => setRefuting(true)}
                data-testid="advisor-refute"
              >
                Refute
              </button>
            </div>
          )}
        </>
      )}
      {turnAnswers.length > 0 && (
        <details className={styles.summary} data-testid="advisor-summary">
          <summary>
            This turn: {turnAnswers.length} answered ({agreed} agreed,{" "}
            {turnAnswers.length - agreed} refuted)
          </summary>
          <ul className={styles.list}>
            {turnAnswers.map((a) => (
              <li key={a.actionIndex}>
                {a.pickLabel}:{" "}
                {a.answer === "agree"
                  ? "agreed"
                  : `refuted (${reasonLabel(a.reason)}${a.note ? `: ${a.note}` : ""})`}
                {a.rules.length > 0 && (
                  <span className={styles.muted}>
                    {" "}
                    · {a.rules.map((r) => r.id).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
