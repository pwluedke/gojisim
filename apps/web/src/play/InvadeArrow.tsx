import { createPortal } from "react-dom";
import styles from "./Board.module.css";

/**
 * The zones an invasion would step through (5.13.1): one zone per invasion icon from `from`,
 * up to zone 8; a step from zone 8 goes into the opponent's zone 8 (5.13.1.1.2).
 */
export function invadePath(
  from: number,
  icon: number,
): { from: number | "opp8"; to: number | "opp8" }[] {
  const hops: { from: number | "opp8"; to: number | "opp8" }[] = [];
  let at: number | "opp8" = from;
  for (let i = 0; i < icon && at !== "opp8"; i++) {
    const next: number | "opp8" = at < 8 ? at + 1 : "opp8";
    hops.push({ from: at, to: next });
    at = next;
  }
  return hops;
}

/**
 * The invade arrow (M5h #7): while a card is dragged over your discard pile for an invade,
 * curved yellow arcs hop from your monster's zone along its path, one per zone stepped. Drawn
 * over the whole window, under nothing that takes the pointer.
 */
export function InvadeArrow({
  you,
  opponent,
  from,
  icon,
}: {
  you: string;
  opponent: string;
  from: number;
  icon: number;
}) {
  const center = (zone: number | "opp8") => {
    const id = zone === "opp8" ? `zone-${opponent}-8` : `zone-${you}-${zone}`;
    const box = document
      .querySelector(`[data-testid="${id}"]`)
      ?.getBoundingClientRect();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  };
  const arcs = invadePath(from, icon).flatMap((hop, i) => {
    const a = center(hop.from);
    const b = center(hop.to);
    if (!a || !b) return [];
    // A hop: the control point sits above the midpoint, by a third of the distance.
    const lift = Math.hypot(b.x - a.x, b.y - a.y) / 3 + 12;
    const cx = (a.x + b.x) / 2;
    const cy = Math.min(a.y, b.y) - lift;
    return [
      <path
        key={i}
        d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
        className={styles.invadeArc}
        markerEnd="url(#invade-head)"
        data-testid="invade-arc"
        data-to={String(hop.to)}
      />,
    ];
  });
  return createPortal(
    <svg className={styles.invadeArrow} data-testid="invade-arrow">
      <defs>
        <marker
          id="invade-head"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className={styles.invadeHead} />
        </marker>
      </defs>
      {arcs}
    </svg>,
    document.querySelector(".gojisim") ?? document.body,
  );
}
