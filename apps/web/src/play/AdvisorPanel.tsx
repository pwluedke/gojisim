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

/** #478 (Nov 19 wording): what each effect tag did to the move, in plain words. */
const EFFECT_TIP: Record<string, string> = {
  forced: "This rule made the bot play this move.",
  favored: "This rule gave the move a head start in the search.",
  freed:
    "Another rule was holding this move back; this rule lifted that hold so the search could try it.",
  removed:
    "This rule took the move off the list, so the search never tried it.",
  against:
    "This rule counted against the move; the search could still pick it.",
};

type Rule = Advice["trace"]["rules"][number];

/**
 * #478 (Nov 19): the rules in three groups: why it chose this move (rules that forced, favored or
 * freed the pick), the moves it ruled out (rules that removed or argued against other moves), and
 * every other rule this turn.
 */
export function ruleGroups(advice: Advice): {
  why: Rule[];
  ruledOut: Rule[];
  other: Rule[];
} {
  const pick = JSON.stringify(advice.trace.pick);
  const touches = (r: Rule) =>
    r.actions.some((a) => JSON.stringify(a) === pick);
  const why = advice.trace.rules.filter(
    (r) => touches(r) && ["forced", "favored", "freed"].includes(r.effect),
  );
  const ruledOut = advice.trace.rules.filter(
    (r) => !touches(r) && (r.effect === "removed" || r.effect === "against"),
  );
  const other = advice.trace.rules.filter(
    (r) => !why.includes(r) && !ruledOut.includes(r),
  );
  return { why, ruledOut, other };
}

/** The three groups' headings, in their order. */
const GROUPS = [
  ["why", "Why it chose this move"],
  ["ruledOut", "Moves it ruled out"],
  ["other", "Other rules this turn"],
] as const;

/**
 * #478 (Nov 19 wording): what "% to win" means, with this move's own number of tries. The search's
 * play-outs run to the end of the opponent's next turn (`rolloutTurns` 1).
 */
const winTip = (looks: number) =>
  `The bot's guess at its chance to win the game if it makes this move. It tried the move ${looks} time${looks === 1 ? "" : "s"} in its head. Each time it guessed your opponent's hidden cards, played both sides on quickly to the end of your opponent's next turn, and scored the position from 0% (lost) to 100% (won). This is the average of those scores. It's a guess at the whole game, about one round ahead, not this turn's result.`;
const LOOKS_TIP =
  "How many of those tries started with this move. The search gives more tries to moves that keep scoring well. The bot plays the move with the most tries, which is usually the highest %.";

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
  if (advice) {
    lines.push(`The bot would: ${labelOf(advice.trace.pick)}`);
    const why = advice.story ? `Why: ${advice.story}` : whySentence(advice);
    if (why) lines.push(why);
  }
  if (turnPlan && turnPlan.length > 0) {
    lines.push("", "Turn plan (it can change as cards are drawn or revealed):");
    turnPlan.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  if (advice) {
    if (advice.trace.alternatives.length > 1) {
      lines.push("", "Moves it weighed:");
      advice.trace.alternatives.forEach((a, i) =>
        lines.push(
          `${i + 1}. ${labelOf(a.action)} (${percent(a.winRate)} to win, ${a.visits} looks)`,
        ),
      );
    }
    const groups = ruleGroups(advice);
    for (const [key, heading] of GROUPS) {
      if (groups[key].length === 0) continue;
      lines.push("", `${heading}:`);
      for (const r of groups[key])
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
        {advice && (
          <>
            <p data-testid="advisor-pick">
              <strong>The bot would:</strong>{" "}
              {withTips(labelOf(advice.trace.pick))}
            </p>
            {advice.story ? (
              <p data-testid="advisor-why">
                <strong>Why:</strong> {advice.story}
              </p>
            ) : (
              whySentence(advice) && (
                <p data-testid="advisor-why">
                  {whySentence(advice).startsWith("Why: ") ? (
                    <>
                      <strong>Why:</strong> {whySentence(advice).slice(5)}
                    </>
                  ) : (
                    whySentence(advice)
                  )}
                </p>
              )
            )}
          </>
        )}
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
            {advice.trace.alternatives.length > 1 && (
              <ol className={styles.list} data-testid="advisor-alternatives">
                {advice.trace.alternatives.map((a, i) => (
                  <li key={i}>
                    {withTips(labelOf(a.action))}{" "}
                    <span className={styles.muted}>
                      (
                      <Tooltip tip={winTip(a.visits)} testId="advisor-win-tip">
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
            {advice.trace.rules.some((r) => r.effect === "removed") && (
              <p className={styles.muted} data-testid="advisor-untried">
                Moves the rules took off the list weren&apos;t tried, so they
                have no %.
              </p>
            )}
            {advice.trace.rules.length > 0 &&
              GROUPS.map(([key, heading]) => {
                const rules = ruleGroups(advice)[key];
                if (rules.length === 0) return null;
                return (
                  <div
                    key={key}
                    className={
                      key === "why"
                        ? styles.whyGroup
                        : key === "other"
                          ? styles.muted
                          : undefined
                    }
                    data-testid={`advisor-rules-${key}`}
                  >
                    <h4 className={styles.groupTitle}>{heading}</h4>
                    <ul className={styles.list} data-testid="advisor-rules">
                      {rules.map((r, i) => (
                        <li key={i}>
                          <Tooltip
                            tip={ruleTip(r.id)}
                            testId="advisor-rule-tip"
                          >
                            <strong
                              className={
                                key === "why" ? styles.whyId : undefined
                              }
                            >
                              {r.id}
                            </strong>
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
                  </div>
                );
              })}
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
                onClick={() => {
                  // Phase 2b: no rule explains the move, so the report opens as a rule gap.
                  const gap = advice.story?.match(
                    /No rule explains this move[^]*?become a rule\./,
                  )?.[0];
                  if (gap && note === "") setNote(`"${gap}" `);
                  setRefuting(true);
                }}
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
