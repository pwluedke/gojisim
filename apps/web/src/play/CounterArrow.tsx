import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Board.module.css";

/** A box on the page, from `getBoundingClientRect`. */
type Box = { left: number; top: number; right: number; bottom: number };

const boxOf = (testId: string): Box | null => {
  const r = document
    .querySelector(`[data-testid="${testId}"]`)
    ?.getBoundingClientRect();
  return r
    ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    : null;
};

/**
 * The arrow from a counter power badge to the opponent's Rage zone, across the center line: from
 * the badge's edge facing the other mat to the Rage zone's facing edge, at the badge's middle.
 */
export function arrowPath(badge: Box, rage: Box): string {
  const x = (badge.left + badge.right) / 2;
  return badge.top > rage.bottom
    ? `M ${x} ${badge.top} L ${x} ${rage.bottom}`
    : `M ${x} ${badge.bottom} L ${x} ${rage.top}`;
}

/**
 * #292 (Paul, Nov 13): a player's total counter power, in their mat's row nearest the center line,
 * right of center, under the opponent's Rage zone (the threat it answers, 7.4.3). The turn
 * player's badge glows in the turn glow's color (the accent when the glow is off).
 */
export function CounterBadge({
  player,
  power,
  lit,
  glowColor,
}: {
  player: string;
  power: number;
  lit: boolean;
  glowColor: string | undefined;
}) {
  const color = glowColor ?? "var(--color-accent)";
  return (
    <div
      className={`${styles.counterBadge}${lit ? ` ${styles.counterBadgeLit}` : ""}`}
      style={
        lit
          ? { borderColor: color, boxShadow: `0 0 10px 2px ${color}` }
          : undefined
      }
      data-testid={`counter-badge-${player}`}
      data-turn={lit ? "true" : "false"}
      title="Counter power: the total of this player's zones' top battle cards, against the opponent's threat (7.4.3)"
    >
      <span className={styles.counterBadgeLabel}>Counter power</span>
      <strong data-testid={`counter-power-${player}`}>{power}</strong>
    </div>
  );
}

/**
 * The two arrows from the counter power badges across the center line to the opponent's Rage
 * zone. The turn player's glows; the other's is dim. Drawn over the page, under nothing that
 * takes the pointer.
 */
export function CounterArrows({
  you,
  opponent,
  turnPlayer,
  glowColor,
}: {
  you: string;
  opponent: string;
  turnPlayer: string;
  /** The turn glow's current color, or `undefined` when the Turn glow setting is off. */
  glowColor: string | undefined;
}) {
  const [paths, setPaths] = useState<Record<string, string> | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const next: Record<string, string> = {};
      for (const [id, other] of [
        [you, opponent],
        [opponent, you],
      ] as const) {
        const badge = boxOf(`counter-badge-${id}`);
        const rage = boxOf(`rage-zone-${other}`);
        if (badge && rage) next[id] = arrowPath(badge, rage);
      }
      setPaths((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const id of ["mat-you", "mat-opp"]) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (el) observer.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });
  if (!paths) return null;
  const color = glowColor ?? "var(--color-accent)";
  return createPortal(
    <svg className={styles.counterArrowSvg} aria-hidden>
      <defs>
        <marker
          id="counter-head"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {[you, opponent].map((id) => {
        const d = paths[id];
        if (!d) return null;
        const lit = id === turnPlayer;
        return (
          <path
            key={id}
            d={d}
            className={lit ? styles.counterPathLit : styles.counterPathDim}
            style={
              lit
                ? { stroke: color, filter: `drop-shadow(0 0 5px ${color})` }
                : undefined
            }
            markerEnd="url(#counter-head)"
            data-testid={`counter-arrow-${id}`}
            data-turn={lit ? "true" : "false"}
          />
        );
      })}
    </svg>,
    document.body,
  );
}
