import { useEffect, useRef } from "react";
import styles from "./Board.module.css";
import type { LogLine } from "./logLines";
import { useInteraction } from "./interaction";

/**
 * The battle log (M5d) in the right column: plain-language lines under turn markers, newest at the
 * bottom. Card names are links that open the preview. Clicking a line shows the board at that
 * moment, read-only; the line being viewed is marked.
 */
export function BattleLog({
  lines,
  viewing,
  showRules,
  onSelect,
}: {
  lines: LogLine[];
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
        <div
          key={line.key}
          className={
            line.kind === "turn"
              ? styles.logTurn
              : `${styles.logLine} ${line.position === viewing ? styles.logViewing : ""}`
          }
          data-testid={line.kind === "turn" ? "log-turn" : "log-line"}
          data-position={line.position}
          onClick={
            line.kind === "turn" ? undefined : () => onSelect(line.position)
          }
        >
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
              [{line.rule}]
            </span>
          )}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
