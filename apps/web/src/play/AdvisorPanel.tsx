import type { Action, AdviceReason, ClassroomAdvice } from "@gojisim/engine";
import { useState } from "react";
import type { Advice } from "../game/useAdvisor";
import styles from "./AdvisorPanel.module.css";
import { Tooltip } from "./Tooltip";

/** #478: what a rule did, in the panel's words. */
const EFFECT: Record<string, string> = {
  removed: "left out",
  forced: "forced",
  freed: "freed",
  favored: "favored",
  against: "argued against",
};

/** The reasons to disagree (Nov 18), in the order shown. */
export const REASONS: { value: AdviceReason; label: string }[] = [
  { value: "wrongCard", label: "Wrong card" },
  { value: "wrongZone", label: "Wrong zone" },
  { value: "wrongTiming", label: "Wrong timing" },
  { value: "other", label: "Other" },
];

/** #478: what each effect tag did to the move list, in plain words. */
const EFFECT_TIP: Record<string, string> = {
  removed:
    "This rule took the move off the list: the bot won't pick it while another move is left.",
  forced:
    "This rule kept only these moves: every other move waits while one of them can be made.",
  freed: "This rule freed the move from another rule that was holding it back.",
  favored:
    "This rule gave the move a head start: the search tries it more, but can still pick another.",
  against:
    "This deck plan argued against the move: the plan's other moves get a head start instead.",
};

const WIN_TIP =
  "The bot's estimate of its chance to win after this move: the average result of the quick games it played out in its head that started with it.";
const LOOKS_TIP =
  "How many of those quick games started with this move. The search spends its looks on the moves that keep doing well, and the bot plays the most-looked-at one.";

/** What a rule id means, by its kind. */
function ruleTip(id: string): string {
  if (id.startsWith("card rule"))
    return `${id}: one of the rules for every deck, numbered as in the play guides' "Rules for every deck".`;
  if (id.startsWith("play rule"))
    return `${id}: one of the play rules for the hardest level (stacking, holding, raging, counter-only cards, columns, zones).`;
  return `${id}: a line of this deck's plan, as in its play guide.`;
}

/** A move's label, with "(icon N)" explained. */
function withTips(label: string) {
  const m = /^(.*)\((icon (\d+))\)(.*)$/.exec(label);
  if (!m) return label;
  return (
    <>
      {m[1]}
      <Tooltip
        tip={`The card's invasion icon: paid for an invasion, it moves your monster ${m[3]} zone${m[3] === "1" ? "" : "s"}.`}
      >
        ({m[2]})
      </Tooltip>
      {m[4]}
    </>
  );
}

/** A rule's sentence, shortened to its first sentence (the panel lists the whole one). */
const shortText = (text: string) => {
  const first =
    text.replace(/^[^:]*rule [^:]*: /i, "").split(/(?<=\.)\s/)[0] ?? text;
  return first.length > 140 ? `${first.slice(0, 137)}…` : first;
};

/**
 * #478: one plain sentence on why the bot picks this, from its trace: a rule that pushed
 * the pick, how many other moves rules took off the list, and where its planned line goes.
 */
export function whySentence(advice: Advice): string {
  const pick = JSON.stringify(advice.trace.pick);
  const touches = (r: Advice["trace"]["rules"][number]) =>
    r.actions.some((a) => JSON.stringify(a) === pick);
  const forPick = advice.trace.rules.find(
    (r) => touches(r) && ["forced", "favored", "freed"].includes(r.effect),
  );
  const removed = advice.trace.rules.filter(
    (r) => !touches(r) && (r.effect === "removed" || r.effect === "against"),
  );
  const parts: string[] = [];
  if (forPick)
    parts.push(`${forPick.id} points to it (${shortText(forPick.text)})`);
  if (removed.length > 0)
    parts.push(
      `${removed.length === 1 ? "one rule takes" : `${removed.length} rules take`} other moves off the list (${removed.map((r) => r.id).join(", ")})`,
    );
  const best = advice.trace.alternatives[0];
  if (
    parts.length === 0 &&
    best?.winRate !== null &&
    best?.winRate !== undefined
  )
    parts.push(
      `it did best of the moves the search tried (${percent(best.winRate)} to win)`,
    );
  const next = advice.plan.slice(1, 3);
  const line =
    next.length > 0
      ? ` It's the first step of a line that goes on: ${next.join(", then ")}.`
      : "";
  const reason = parts.length > 0 ? `Why: ${parts.join("; ")}.` : "";
  return `${reason}${line}`.trim();
}

/**
 * #478 (Nov 19): the whole panel as plain text, for "Copy text": the turn plan, the bot's move,
 * the why sentence, the moves it weighed with their numbers, and the rules with ids and effects.
 */
export function adviceText(
  advice: Advice | null,
  turnPlan: string[] | null,
  labelOf: (action: Action) => string,
): string {
  const lines: string[] = [];
  if (turnPlan && turnPlan.length > 0) {
    lines.push("Turn plan (it can change as cards are drawn or revealed):");
    turnPlan.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push("");
  }
  if (advice) {
    lines.push(`The bot would: ${labelOf(advice.trace.pick)}`);
    const why = whySentence(advice);
    if (why) lines.push(why);
    if (advice.trace.alternatives.length > 1) {
      lines.push("", "Moves it weighed:");
      advice.trace.alternatives.forEach((a, i) =>
        lines.push(
          `${i + 1}. ${labelOf(a.action)} (${percent(a.winRate)} to win, ${a.visits} looks)`,
        ),
      );
    }
    if (advice.trace.rules.length > 0) {
      lines.push("", "Rules:");
      for (const r of advice.trace.rules)
        lines.push(`- ${r.id} (${EFFECT[r.effect] ?? r.effect}): ${r.text}`);
    }
  }
  return lines.join("\n").trim();
}

const reasonLabel = (reason: AdviceReason | undefined) =>
  REASONS.find((r) => r.value === reason)?.label.toLowerCase();

const percent = (rate: number | null) =>
  rate === null ? "–" : `${Math.round(rate * 100)}%`;

/**
 * #478 (Bot Advisor, phase 2a): in a Kaiju Classroom game, at each of your decisions, the move
 * the bot would make in your seat, the moves it weighed and the rules behind it, with Agree or
 * Disagree. Nothing is played for you. Below, this turn's answers.
 */
export function AdvisorPanel({
  advice,
  thinking,
  labelOf,
  answered,
  turnPlan,
  turnAnswers,
  onAnswer,
}: {
  advice: Advice | null;
  thinking: boolean;
  /** An action as the battle log words it, at the advised position. */
  labelOf: (action: Action) => string;
  /** Your answer at this decision, if you gave one. */
  answered: ClassroomAdvice | null;
  /** #478: the bot's plan for the whole turn, made at its first decision. */
  turnPlan: string[] | null;
  /** Your answers this turn, oldest first. */
  turnAnswers: ClassroomAdvice[];
  onAnswer: (
    answer: "agree" | "disagree",
    reason?: AdviceReason,
    note?: string,
  ) => void;
}) {
  const [refuting, setRefuting] = useState(false);
  const [reason, setReason] = useState<AdviceReason>("wrongCard");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        adviceText(advice, turnPlan, labelOf),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const agreed = turnAnswers.filter((a) => a.answer === "agree").length;
  return (
    <div className={styles.panel} data-testid="advisor">
      <div className={styles.header}>
        <h3 className={styles.title}>Advisor</h3>
        {(advice || (turnPlan && turnPlan.length > 0)) && (
          <button
            type="button"
            className={styles.copy}
            onClick={() => void copy()}
            data-testid="advisor-copy"
          >
            {copied ? "Copied" : "Copy text"}
          </button>
        )}
      </div>
      <div className={styles.body} data-testid="advisor-body">
        {turnPlan && turnPlan.length > 0 && (
          <div className={styles.plan} data-testid="advisor-turn-plan">
            <strong>Turn plan</strong>{" "}
            <span className={styles.muted}>
              (the bot's line for your whole turn; it can change as cards are
              drawn or revealed)
            </span>
            <ol className={styles.list}>
              {turnPlan.map((step, i) => (
                <li key={i}>{withTips(step)}</li>
              ))}
            </ol>
          </div>
        )}
        {!advice && thinking && (
          <p className={styles.muted} data-testid="advisor-thinking">
            The bot is thinking about your move…
          </p>
        )}
        {advice && (
          <>
            <p data-testid="advisor-pick">
              <strong>The bot would:</strong>{" "}
              {withTips(labelOf(advice.trace.pick))}
            </p>
            {whySentence(advice) && (
              <p data-testid="advisor-why">{whySentence(advice)}</p>
            )}
            {advice.trace.alternatives.length > 1 && (
              <ol className={styles.list} data-testid="advisor-alternatives">
                {advice.trace.alternatives.map((a, i) => (
                  <li key={i}>
                    {withTips(labelOf(a.action))}{" "}
                    <span className={styles.muted}>
                      (
                      <Tooltip tip={WIN_TIP} testId="advisor-win-tip">
                        {percent(a.winRate)} to win
                      </Tooltip>
                      ,{" "}
                      <Tooltip tip={LOOKS_TIP} testId="advisor-looks-tip">
                        {a.visits} looks
                      </Tooltip>
                      )
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {advice.trace.rules.length > 0 && (
              <ul className={styles.list} data-testid="advisor-rules">
                {advice.trace.rules.map((r, i) => (
                  <li key={i}>
                    <Tooltip tip={ruleTip(r.id)} testId="advisor-rule-tip">
                      <strong>{r.id}</strong>
                    </Tooltip>{" "}
                    <span className={styles.muted}>
                      (
                      <Tooltip
                        tip={EFFECT_TIP[r.effect] ?? r.effect}
                        testId="advisor-effect-tip"
                      >
                        {EFFECT[r.effect] ?? r.effect}
                      </Tooltip>
                      )
                    </span>
                    : {r.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {turnAnswers.length > 0 && (
          <details className={styles.summary} data-testid="advisor-summary">
            <summary>
              This turn: {turnAnswers.length} answered ({agreed} agreed,{" "}
              {turnAnswers.length - agreed} disagreed)
            </summary>
            <ul className={styles.list}>
              {turnAnswers.map((a) => (
                <li key={a.actionIndex}>
                  {a.pickLabel}:{" "}
                  {a.answer === "agree"
                    ? "agreed"
                    : `disagreed (${reasonLabel(a.reason)}${a.note ? `: ${a.note}` : ""})`}
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
      </div>
      {advice && (
        <div className={styles.footer} data-testid="advisor-footer">
          {answered ? (
            <p className={styles.muted} data-testid="advisor-answered">
              You{" "}
              {answered.answer === "agree"
                ? "agreed"
                : `disagreed (${reasonLabel(answered.reason)}${answered.note ? `: ${answered.note}` : ""})`}
              .
            </p>
          ) : refuting ? (
            <div className={styles.disagree}>
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
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={
                  reason === "other"
                    ? "What should it do instead? (needed)"
                    : "Explain in your words (optional)"
                }
                data-testid="advisor-note"
                aria-label="Your reason in detail"
              />
              <button
                type="button"
                disabled={reason === "other" && note.trim() === ""}
                onClick={() => {
                  onAnswer("disagree", reason, note.trim() || undefined);
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
                data-testid="advisor-disagree"
              >
                Disagree
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
