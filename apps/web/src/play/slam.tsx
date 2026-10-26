import type { Card } from "@gojisim/cards";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Board.module.css";
import type { BoardModel } from "./model";
import type { AnimationSpeed } from "./settings";

/**
 * Durations in ms of the invasion-win slam (M5h #20) at a speed: the lift onto the opponent's
 * mat, the slam into their zone 8, and the crater (cracks spreading, the mat shaking). Fast is
 * half of Normal; Off has no motion.
 */
export function slamDurations(speed: AnimationSpeed): {
  lift: number;
  slam: number;
  crater: number;
} {
  if (speed === "off") return { lift: 0, slam: 0, crater: 0 };
  if (speed === "fast") return { lift: 210, slam: 120, crater: 260 };
  return { lift: 420, slam: 240, crater: 520 };
}

/** The angle (degrees) the monster lands at in the opponent's zone 8. */
export const SLAM_ANGLE = 10;
/** How large the monster grows at the top of the lift. */
export const SLAM_LIFT_SCALE = 1.6;

/** FNV-1a, for the crack layout's seed. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The crater's cracks: thin jagged lines out from the middle of a 200 × 200 box, each with side
 * branches, plus short broken arcs around the impact. The same seed always gives the same
 * cracks, so a replay looks the same.
 */
export function crackPaths(seed: string, count = 13): string[] {
  let s = hash(seed) || 1;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const pt = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    let angle = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    let x = 100 + Math.cos(angle) * 26;
    let y = 100 + Math.sin(angle) * 26;
    const points = [pt(x, y)];
    // Cracks reach different distances, so the edge is ragged.
    const segments = 3 + Math.floor(rnd() * 4);
    for (let j = 0; j < segments; j++) {
      angle += (rnd() - 0.5) * 0.7;
      const length = 7 + rnd() * 9;
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
      points.push(pt(x, y));
      if (rnd() < 0.3) {
        const side = angle + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6);
        const reach = 5 + rnd() * 9;
        paths.push(
          `M ${pt(x, y)} L ${pt(x + Math.cos(side) * reach, y + Math.sin(side) * reach)}`,
        );
      }
    }
    paths.push(`M ${points.join(" L ")}`);
  }
  // Broken rings around the impact.
  for (const radius of [34, 52]) {
    let a = rnd() * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const span = 0.3 + rnd() * 0.5;
      const r = radius + (rnd() - 0.5) * 6;
      paths.push(
        `M ${pt(100 + Math.cos(a) * r, 100 + Math.sin(a) * r)} L ${pt(100 + Math.cos(a + span / 2) * (r + 2), 100 + Math.sin(a + span / 2) * (r + 2))} L ${pt(100 + Math.cos(a + span) * r, 100 + Math.sin(a + span) * r)}`,
      );
      a += span + 0.6 + rnd() * 0.8;
    }
  }
  return paths;
}

type Phase = "wait" | "play" | "done";

interface Boxes {
  from: DOMRect;
  to: DOMRect;
}

/**
 * The invasion-win slam (M5h #20): once the winning invasion's card moves have landed, the
 * winner's monster lifts onto the opponent's mat, growing to 1.6×, then slams into their zone 8
 * at an angle with an overshoot and stays there on top; seeded cracks spread out from it and the
 * mat shakes. It is drawn in the top-level animation layer. The game-over modal waits for it
 * (`onPlaying`). With Animation Off, or for a game that was already over when the board opened
 * (a loaded record), the monster and the cracks are simply there.
 */
export function InvasionSlam({
  model,
  root,
  speed,
  waiting,
  onPlaying,
}: {
  model: BoardModel;
  /** The board, to find the monster card, the zone and the mat. */
  root: HTMLElement | null;
  speed: AnimationSpeed;
  /** Card moves are still flying: the slam starts after them. */
  waiting: boolean;
  onPlaying: (playing: boolean) => void;
}) {
  const result = model.view.result;
  const winner =
    result?.reason === "invasion" && result.winner ? result.winner : null;
  const loser = winner
    ? model.view.players.find((p) => p.id !== winner)?.id
    : undefined;
  const monster = model.view.players
    .find((p) => p.id === winner)
    ?.invadingMonsterZone.cards?.at(-1);
  const data: Card | undefined = monster
    ? model.view.cards[monster.cardId]
    : undefined;
  const key = winner && monster ? `${winner}|${monster.instanceId}` : null;

  // A game already won when the board opened shows the end at once; one won here plays.
  const openedWith = useRef(key);
  const animate = key !== null && key !== openedWith.current && speed !== "off";
  const [phase, setPhase] = useState<Phase>("wait");
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const report = useRef(onPlaying);
  report.current = onPlaying;

  // Waiting and playing both hold the game-over modal; report it before the first paint.
  useLayoutEffect(() => {
    report.current(animate && phase !== "done");
  }, [animate, phase]);
  useLayoutEffect(() => () => report.current(false), []);

  // Measure the monster's card and the opponent's zone 8 once the moves have landed.
  useLayoutEffect(() => {
    if (!key || !root || waiting || !monster || !loser) return;
    const measure = () => {
      const card = root.querySelector<HTMLElement>(
        `[data-testid="card"][data-instance-id="${monster.instanceId}"]`,
      );
      const zone = root.querySelector<HTMLElement>(
        `[data-testid="zone-${loser}-8"]`,
      );
      if (!card || !zone) return;
      // The monster has gone onto the opponent's mat: its own place is left empty.
      card.style.visibility = "hidden";
      setBoxes((old) => ({
        from: old?.from ?? card.getBoundingClientRect(),
        to: zone.getBoundingClientRect(),
      }));
    };
    measure();
    setPhase((p) => (p === "wait" ? (animate ? "play" : "done") : p));
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      const card = root.querySelector<HTMLElement>(
        `[data-testid="card"][data-instance-id="${monster.instanceId}"]`,
      );
      if (card) card.style.visibility = "";
    };
  }, [key, root, waiting, monster, loser, animate]);

  // Lift, slam, then the crater and the mat shake.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (phase !== "play" || !el || !boxes || !root || !loser) return;
    const { lift, slam, crater } = slamDurations(speed);
    const { from, to } = boxes;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const total = lift + slam;
    const at = (ms: number) => ms / total;
    const flight = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0deg)` },
        {
          // Up over the opponent's mat, a little short of the zone.
          transform: `translate(${dx * 0.35}px, ${dy * 0.35}px) scale(${SLAM_LIFT_SCALE}) rotate(-4deg)`,
          offset: at(lift),
          easing: "cubic-bezier(0.55, 0, 0.9, 0.4)",
        },
        {
          // The hit: a little past the final angle and squashed.
          transform: `translate(0px, 0px) scale(0.92) rotate(${SLAM_ANGLE + 4}deg)`,
          offset: at(lift + slam * 0.75),
        },
        { transform: `translate(0px, 0px) scale(1) rotate(${SLAM_ANGLE}deg)` },
      ],
      { duration: total, fill: "both" },
    );
    const mat = root.querySelector<HTMLElement>(
      `[data-player="${loser}"][data-testid^="mat-"]`,
    );
    let shake: Animation | undefined;
    const timer = setTimeout(() => {
      shake = mat?.animate(
        [
          { translate: "0 0" },
          { translate: "-6px 3px" },
          { translate: "5px -4px" },
          { translate: "-4px -2px" },
          { translate: "3px 2px" },
          { translate: "0 0" },
        ],
        { duration: crater * 0.6, easing: "ease-out" },
      );
    }, total);
    const done = setTimeout(() => setPhase("done"), total + crater);
    return () => {
      clearTimeout(timer);
      clearTimeout(done);
      flight.cancel();
      shake?.cancel();
    };
    // Plays once per slam; later renders don't restart it.
  }, [phase, boxes === null]);

  if (!key || !data || !monster || phase === "wait" || !boxes) return null;
  const { to, from } = boxes;
  const { lift, slam, crater } = slamDurations(speed);
  const cracking = phase === "play";
  const craterSize = to.height * 2.6;
  const layer = root?.closest(".gojisim") ?? document.body;
  return createPortal(
    <div
      className={styles.slamLayer}
      data-testid="invasion-slam"
      data-phase={phase}
      data-winner={winner}
    >
      <svg
        className={styles.slamCracks}
        data-testid="slam-cracks"
        data-seed={monster.instanceId}
        viewBox="0 0 200 200"
        style={{
          left: to.left + to.width / 2 - craterSize / 2,
          top: to.top + to.height / 2 - craterSize / 2,
          width: craterSize,
          height: craterSize,
          ...(cracking
            ? {
                animationDuration: `${crater}ms`,
                animationDelay: `${lift + slam}ms`,
              }
            : { animation: "none", opacity: 1 }),
        }}
      >
        <defs>
          <radialGradient id="slam-crater">
            <stop
              offset="0%"
              stopColor="var(--color-crack)"
              stopOpacity="0.55"
            />
            <stop
              offset="60%"
              stopColor="var(--color-crack)"
              stopOpacity="0.2"
            />
            <stop
              offset="100%"
              stopColor="var(--color-crack)"
              stopOpacity="0"
            />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="100" rx="44" ry="40" fill="url(#slam-crater)" />
        {crackPaths(monster.instanceId).map((d, i) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            className={styles.slamCrack}
            style={
              cracking
                ? {
                    animationDuration: `${crater}ms`,
                    animationDelay: `${lift + slam}ms`,
                  }
                : { animation: "none", strokeDashoffset: 0 }
            }
          />
        ))}
      </svg>
      <div
        ref={cardRef}
        className={styles.slamCard}
        data-testid="slam-card"
        data-instance-id={monster.instanceId}
        style={{
          left: to.left + to.width / 2 - from.width / 2,
          top: to.top + to.height / 2 - from.height / 2,
          width: from.width,
          height: from.height,
          transform: `rotate(${SLAM_ANGLE}deg)`,
        }}
      >
        <div className={styles.cardFallback}>{data.name}</div>
        <img
          className={styles.cardImage}
          src={`/cards/${data.id}-thumb.webp`}
          alt={data.name}
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      </div>
    </div>,
    layer,
  );
}
