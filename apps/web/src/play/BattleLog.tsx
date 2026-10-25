import { useEffect, useRef } from "react";
import styles from "./Board.module.css";
import type { LogLine, LogTag } from "./logLines";
import { useInteraction } from "./interaction";
import { ruleByNumber } from "../rules/rules";
import { Tooltip } from "./Tooltip";

/** A rule number's tooltip (M5h #11): the rule's text, shortened. */
function ruleTip(number: string): string {
  const rule = ruleByNumber(number);
  if (!rule) return `Rule ${number}`;
  const text =
    rule.text.length > 280
      ? `${rule.text.slice(0, 277).trimEnd()}…`
      : rule.text;
  return `${rule.number} ${text}`;
}

/**
 * The battle log (M5d) in the right column: plain-language lines under turn markers, newest at the
 * bottom. Card names are links that open the preview. Clicking a line shows the board at that
 * moment, read-only; the line being viewed is marked.
 */
const TAG_WORDS: Record<LogTag, string> = {
  destroy: "Destroy",
  rage: "Rage",
  draw: "Draw",
  search: "Search",
  reveal: "Reveal",
  mill: "Mill",
  play: "Play",
  invade: "Invade",
  counter: "Counter",
  combo: "Combo",
};

/** Tag colors by group (M5h #4): draw, search, reveal and mill share one; invade and counter one. */
const TAG_CLASS: Record<LogTag, string | undefined> = {
  destroy: styles.tagDestroy,
  rage: styles.tagRage,
  draw: styles.tagInfo,
  search: styles.tagInfo,
  reveal: styles.tagInfo,
  mill: styles.tagInfo,
  play: styles.tagPlay,
  invade: styles.tagMove,
  counter: styles.tagMove,
  combo: styles.tagCombo,
};

export function BattleLog({
  lines,
  viewing,
  showRules,
  onSelect,
  viewer,
  onRule,
}: {
  lines: LogLine[];
  /** M5h #4: the human's seat; their lines take the "you" border color. */
  viewer?: string | undefined;
  /** M5h #11: opens the rules panel at a rule number. */
  onRule?: (rule: string) => void;
  /** The session position shown in the history view, or `null` when live. */
  viewing: number | null;
  showRules: boolean;
  onSelect: (position: number) => void;
}) {
  const { previewCard } = useInteraction();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Live, follow the newest line. Braces: scrollIntoView may return a Promise.
    if (viewing === null) end.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, viewing]);
  return (
    <div className={styles.log} data-testid="battle-log">
      {lines.map((line) => (
        // Undone lines (M5h #10) are dimmed and never open the history view.
        <div
          key={line.key}
          className={
            line.kind === "turn"
              ? styles.logTurn
              : line.kind === "undone"
                ? `${styles.logLine} ${styles.logUndone}`
                : `${styles.logLine} ${line.kind === "combo" ? styles.logCombo : ""} ${line.position === viewing ? styles.logViewing : ""}`
          }
          data-testid={
            line.kind === "turn"
              ? "log-turn"
              : line.kind === "undone"
                ? "log-undone"
                : "log-line"
          }
          data-combo={line.kind === "combo" ? "true" : undefined}
          data-position={line.position}
          data-side={
            line.kind === "turn" || !line.player
              ? undefined
              : line.player === viewer
                ? "you"
                : "opp"
          }
          data-tag={line.tag ?? undefined}
          onClick={
            line.kind === "turn" || line.kind === "undone"
              ? undefined
              : () => onSelect(line.position)
          }
        >
          {line.tag && (
            // The word is drawn from `data-label` (CSS), so the line's text stays its own.
            <span
              className={`${styles.logTag} ${TAG_CLASS[line.tag] ?? ""}`}
              data-testid="log-tag"
              data-label={TAG_WORDS[line.tag]}
            />
          )}
          {line.parts.map((part, i) =>
            typeof part === "string" ? (
              <span key={i}>{part}</span>
            ) : (
              <button
                key={i}
                type="button"
                className={styles.cardLink}
                data-testid="log-card"
                data-card-id={part.card.id}
                onMouseEnter={() => previewCard(part.card)}
                onMouseLeave={() => previewCard(null)}
                onClick={(e) => {
                  // A card name opens the preview; the line's history view stays a line click.
                  e.stopPropagation();
                  previewCard(part.card);
                }}
              >
                {part.card.name}
              </button>
            ),
          )}
          {showRules && line.rule && (
            <span className={styles.muted} data-testid="log-rule">
              {" "}
              <Tooltip tip={ruleTip(line.rule)} testId="rule-tip">
                <button
                  type="button"
                  className={styles.ruleLink}
                  data-testid="rule-link"
                  data-rule={line.rule}
                  onClick={(e) => {
                    // The rules panel, not the line's history view.
                    e.stopPropagation();
                    onRule?.(line.rule as string);
                  }}
                >
                  [{line.rule}]
                </button>
              </Tooltip>
            </span>
          )}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
