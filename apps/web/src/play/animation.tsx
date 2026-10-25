import type { LogEntry } from "@gojisim/engine";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./Board.module.css";
import { clipPath, shardLayout } from "./shards";
import type { BoardModel } from "./model";
import type { AnimationSpeed } from "./settings";

/**
 * Card movement animations (M5f), built from two board snapshots: where every rendered card and
 * pile was before a game step, and where they are after it (FLIP). Instance ids change on every
 * move (4.1.4), so a card that left one place is paired with a card of the same card id that
 * appeared in another. A card with no partner comes from, or goes to, a pile whose count changed
 * (deck, monster deck, discard pile, hand). New kinds of moves animate without card-specific code.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One rendered card (a `[data-instance-id]` card face on the board). */
export interface CardSpot {
  instanceId: string;
  cardId: number | null;
  owner: string;
  box: Box;
}

/** The board at one moment: its cards, its piles' places and counts. */
export interface Snapshot {
  /** The shown state's action count, or `null` in the history view. */
  step: number | null;
  bottom: string;
  logLength: number;
  cards: Map<string, CardSpot>;
  /** Pile places by `<player>|<pile>` (deck, monsterDeck, discard, hand). */
  anchors: Record<string, Box>;
  /** Pile sizes by the same keys. */
  counts: Record<string, number>;
}

/** One card flying from `from` to `to`. */
export interface Flight {
  id: string;
  /** The card to show; `null` flies a card back (a hidden card). */
  cardId: number | null;
  from: Box;
  to: Box;
  /** The arrived card, hidden until the flight lands; none when it lands in a pile. */
  target: string | null;
  /** A destroyed card: it breaks apart and pulls back together before it moves (M5f). */
  shatter: boolean;
  /**
   * The moving card's instance id where it started (before the move), which seeds its shard
   * layout, so a destroy breaks the same way on every replay.
   */
  seed: string;
  /**
   * A covered card (M5g fix): the old top of the stack a card lands on (the discard pile, a
   * Larva, the monster stack). It stays where it was, under the moving card, until it lands.
   */
  stay?: true;
  /** A move to the bottom of the deck: the pile is drawn over it, so it slides under. */
  underPile?: true;
}

export const PILES = ["hand", "deck", "monsterDeck", "discard"] as const;

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

/** A `width` x `height` box centered on `box`. */
export function centered(box: Box, width: number, height: number): Box {
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

/**
 * How a card moves from `from` to `to` (M5f fix): its centers line up, and one uniform scale
 * matches the cards' longer sides, so it keeps the card's shape and never grows past the larger
 * of the two sizes. (A strategy card from a landscape zone stays landscape.)
 */
export function moveTransform(
  from: Box,
  to: Box,
): { x: number; y: number; scale: number } {
  return {
    x: to.x + to.width / 2 - (from.x + from.width / 2),
    y: to.y + to.height / 2 - (from.y + from.height / 2),
    scale: Math.max(to.width, to.height) / Math.max(from.width, from.height),
  };
}

/** Reads the board under `root` (rendered from `model`). */
export function snapshot(
  root: HTMLElement,
  model: BoardModel,
  step: number | null,
): Snapshot {
  const cards = new Map<string, CardSpot>();
  root
    .querySelectorAll<HTMLElement>('[data-testid="card"][data-instance-id]')
    .forEach((el) => {
      const instanceId = el.dataset["instanceId"] as string;
      cards.set(instanceId, {
        instanceId,
        cardId: el.dataset["cardId"] ? Number(el.dataset["cardId"]) : null,
        owner: el.dataset["owner"] ?? "",
        box: boxOf(el),
      });
    });
  // Piles are measured as one card where a card sits there, never as their container (a hand
  // row or a pile cell), so a moving card keeps its shape (M5f fix).
  const zone = root.querySelector('[data-testid$="-1"][data-testid^="zone-"]');
  const boardCard = zone ? boxOf(zone) : { x: 0, y: 0, width: 63, height: 88 };
  const anchors: Record<string, Box> = {};
  const counts: Record<string, number> = {};
  for (const player of model.view.players) {
    const own = player.id === model.bottom;
    const places: Record<
      (typeof PILES)[number],
      { area: string; card: string; size: number }
    > = {
      hand: own
        ? { area: "hand-strip", card: '[data-testid="hand-card"]', size: 1 }
        : {
            area: "opponent-hand",
            card: '[data-testid="opponent-card-back"], [data-testid="card"]',
            size: 0.5,
          },
      deck: {
        area: `deck-${player.id}`,
        card: '[data-testid="pile-back"]',
        size: 1,
      },
      monsterDeck: {
        area: `monster-deck-${player.id}`,
        card: '[data-testid="pile-back"]',
        size: 1,
      },
      discard: {
        area: `discard-${player.id}`,
        card: '[data-testid="card"]',
        size: 1,
      },
    };
    for (const pile of PILES) {
      const { area, card, size } = places[pile];
      const el = root.querySelector(`[data-testid="${area}"]`);
      if (el) {
        const cards = el.querySelectorAll(card);
        const last = cards[cards.length - 1];
        anchors[`${player.id}|${pile}`] = last
          ? boxOf(last)
          : centered(
              boxOf(el),
              boardCard.width * size,
              boardCard.height * size,
            );
      }
      counts[`${player.id}|${pile}`] = player[pile].count;
    }
  }
  return {
    step,
    bottom: model.bottom,
    logLength: model.view.log.length,
    cards,
    anchors,
    counts,
  };
}

/** Card ids destroyed in the log entries after `from`: destroys, and replaced destroys. */
export function destroyedCards(
  log: readonly LogEntry[],
  from: number,
): number[] {
  return log.slice(from).flatMap((e) => {
    if (e.type === "destroy")
      return (e.payload["cardIds"] as number[] | undefined) ?? [];
    if (e.type === "replace" && e.payload["replaces"] === "destroyed")
      return [e.payload["cardId"] as number];
    return [];
  });
}

/**
 * The flights from `prev` to `next`. `destroyed` lists destroyed card ids (each shatters once);
 * `drop` is where a dragged card was let go, so it settles from there.
 */
export function planFlights(
  prev: Snapshot,
  next: Snapshot,
  destroyed: readonly number[],
  drop: { instanceId: string; box: Box } | null = null,
  /** Card ids put on the bottom of a deck in this step (`putOnDeck`, bottom). */
  bottoms: readonly number[] = [],
): Flight[] {
  const removed = [...prev.cards.values()].filter(
    (c) => !next.cards.has(c.instanceId),
  );
  const added = [...next.cards.values()].filter(
    (c) => !prev.cards.has(c.instanceId),
  );
  const delta = (key: string) =>
    (next.counts[key] ?? 0) - (prev.counts[key] ?? 0);
  // Pile changes left to explain, by key: negative is cards that left, positive cards that came.
  const left = new Map<string, number>();
  for (const key of Object.keys(next.counts)) left.set(key, delta(key));
  const doomed = [...destroyed];
  const shatters = (cardId: number | null) => {
    const i = cardId === null ? -1 : doomed.indexOf(cardId);
    if (i < 0) return false;
    doomed.splice(i, 1);
    return true;
  };
  const take = (owner: string, sign: 1 | -1, order: readonly string[]) => {
    for (const pile of order) {
      const key = `${owner}|${pile}`;
      const n = left.get(key) ?? 0;
      if (n * sign > 0 && prev.anchors[key] && next.anchors[key]) {
        left.set(key, n - sign);
        return sign < 0 ? prev.anchors[key] : next.anchors[key];
      }
    }
    return undefined;
  };

  const flights: Flight[] = [];
  const used = new Set<string>();
  for (const card of added) {
    const partners = removed.filter(
      (r) =>
        !used.has(r.instanceId) &&
        r.cardId !== null &&
        r.cardId === card.cardId,
    );
    const partner = partners.find((r) => r.owner === card.owner) ?? partners[0];
    if (partner) {
      used.add(partner.instanceId);
      flights.push({
        id: card.instanceId,
        cardId: card.cardId,
        from: drop?.instanceId === partner.instanceId ? drop.box : partner.box,
        to: card.box,
        target: card.instanceId,
        shatter: shatters(card.cardId),
        seed: partner.instanceId,
      });
      continue;
    }
    // From a pile that lost a card: a draw, a search, a play from hidden hand or the discard pile.
    const from = take(card.owner, -1, [
      "hand",
      "deck",
      "monsterDeck",
      "discard",
    ]);
    if (from)
      flights.push({
        id: card.instanceId,
        cardId: card.cardId,
        from,
        to: card.box,
        target: card.instanceId,
        shatter: false,
        seed: card.instanceId,
      });
  }
  // A card that left the board where a moving card lands was covered, not moved (a stack's old
  // top): it stays in place, under the moving card, until that card lands.
  const stays: Flight[] = [];
  const near = (a: Box, b: Box) =>
    Math.abs(a.x - b.x) < 3 &&
    Math.abs(a.y - b.y) < 3 &&
    Math.abs(a.width - b.width) < 3 &&
    Math.abs(a.height - b.height) < 3;
  for (const card of removed) {
    if (used.has(card.instanceId)) continue;
    if (!flights.some((f) => f.target !== null && near(f.to, card.box)))
      continue;
    used.add(card.instanceId);
    stays.push({
      id: `${card.instanceId}=`,
      cardId: card.cardId,
      from: card.box,
      to: card.box,
      target: null,
      shatter: false,
      seed: card.instanceId,
      stay: true,
    });
  }
  const sentToBottom = [...bottoms];
  for (const card of removed) {
    if (used.has(card.instanceId)) continue;
    // Put on the bottom of its deck (the log says so): to the deck, even when the deck's count
    // fell in the same step (a draw after it). Else into a pile that gained a card: a discard
    // below the top, a hidden hand.
    const bottom =
      card.cardId !== null &&
      sentToBottom.includes(card.cardId) &&
      !!next.anchors[`${card.owner}|deck`];
    if (bottom)
      sentToBottom.splice(sentToBottom.indexOf(card.cardId as number), 1);
    const to = bottom
      ? next.anchors[`${card.owner}|deck`]
      : take(card.owner, 1, ["discard", "deck", "monsterDeck", "hand"]);
    if (!to) continue;
    flights.push({
      id: `${card.instanceId}>`,
      cardId: card.cardId,
      from: card.box,
      to,
      target: null,
      shatter: shatters(card.cardId),
      seed: card.instanceId,
      ...(bottom ? { underPile: true as const } : {}),
    });
  }
  // Hidden cards between piles (an opponent's draw: deck to hand), as card backs.
  for (const key of Object.keys(next.counts)) {
    const [owner = "", pile] = key.split("|");
    if (pile !== "hand") continue;
    let n = left.get(key) ?? 0;
    while (n > 0) {
      const from = take(owner, -1, ["deck", "monsterDeck"]);
      const to = next.anchors[key];
      if (!from || !to) break;
      flights.push({
        id: `${key}#${n}`,
        cardId: null,
        from,
        to,
        target: null,
        shatter: false,
        seed: key,
      });
      n--;
    }
    left.set(key, n);
  }
  // Covered cards first, so every moving card is drawn above them.
  return [...stays, ...flights];
}

/** Card ids put on the bottom of a deck in the log entries after `from` (`putOnDeck`). */
export function bottomedCards(
  log: readonly LogEntry[],
  from: number,
): number[] {
  return log
    .slice(from)
    .filter((e) => e.type === "putOnDeck" && e.payload["where"] === "bottom")
    .map((e) => e.payload["cardId"] as number);
}

/** Durations in ms for a speed: the move, and each half of a destroy's break (apart, together). */
/**
 * Durations in ms for a speed (M5f). A destroy explodes, hangs with its shards spread (Paul's
 * change: about 300 ms at Normal), then reassembles in flight over the move.
 */
export function durations(speed: AnimationSpeed): {
  move: number;
  explode: number;
  hang: number;
} {
  if (speed === "fast") return { move: 220, explode: 160, hang: 150 };
  return { move: 450, explode: 320, hang: 300 };
}

/** The total time a set of flights takes. */
export function flightsTime(
  flights: readonly Flight[],
  speed: AnimationSpeed,
): number {
  const moving = flights.filter((f) => !f.stay);
  if (moving.length === 0 || speed === "off") return 0;
  const { move, explode, hang } = durations(speed);
  return Math.max(
    ...moving.map((f) => (f.shatter ? explode + hang : 0) + move),
  );
}

/** The flying cards, drawn over the board (pointer events pass through). */
export function FlightLayer({
  flights,
  speed,
  cards,
}: {
  flights: readonly Flight[];
  speed: AnimationSpeed;
  cards: BoardModel["view"]["cards"];
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    const { move, explode, hang } = durations(speed);
    const running: Animation[] = [];
    for (const flight of flights) {
      const el = refs.current.get(flight.id);
      if (!el || flight.stay) continue;
      const { from, to } = flight;
      const t = moveTransform(from, to);
      const shift = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
      // A destroyed card moves only once its shards have exploded and hung; they reassemble on
      // the way, so it never sits whole where it was destroyed.
      const delay = flight.shatter ? explode + hang : 0;
      el.dataset["started"] = String(performance.now());
      el.dataset["moveAt"] = String(delay);
      el.dataset["moveMs"] = String(move);
      running.push(
        el.animate([{ transform: "none" }, { transform: shift }], {
          duration: move,
          delay,
          easing: "ease-in-out",
          fill: "forwards",
        }),
      );
      if (!flight.shatter) continue;
      const shards = shardLayout(flight.seed);
      el.querySelectorAll<HTMLElement>("[data-piece]").forEach((piece, i) => {
        const shard = shards[i];
        if (!shard) return;
        // Out from the card's center, along the line through the shard's own center.
        const [cx, cy] = shard.center;
        const dx = cx - 0.5;
        const dy = cy - 0.5;
        const length = Math.hypot(dx, dy) || 1;
        const out = shard.distance * from.width;
        const apart = `translate(${(dx / length) * out}px, ${(dy / length) * out}px) rotate(${shard.turn}deg)`;
        // Explode, hang spread out, then converge while the card flies to its destination.
        const total = explode + hang + move;
        running.push(
          piece.animate(
            [
              { transform: "none", easing: "ease-out" },
              { transform: apart, offset: explode / total },
              {
                transform: apart,
                offset: (explode + hang) / total,
                easing: "ease-in-out",
              },
              { transform: "none" },
            ],
            { duration: total, fill: "forwards" },
          ),
        );
      });
    }
    return () => running.forEach((a) => a.cancel());
  }, [flights, speed]);

  return (
    <div className={styles.flightLayer} aria-hidden>
      {flights.map((flight) => {
        const card = flight.cardId === null ? undefined : cards[flight.cardId];
        const src = card ? `/cards/${card.id}-thumb.webp` : null;
        const { from } = flight;
        const ghost = (
          <div
            key={flight.id}
            ref={(el) => {
              if (el) refs.current.set(flight.id, el);
              else refs.current.delete(flight.id);
            }}
            className={
              card ? styles.flight : `${styles.flight} ${styles.flightBack}`
            }
            data-testid="flight"
            data-flight-id={flight.id}
            data-stay={flight.stay ? "true" : undefined}
            data-under-pile={flight.underPile ? "true" : undefined}
            data-card-id={card?.id}
            data-shatter={flight.shatter ? "true" : undefined}
            data-seed={flight.shatter ? flight.seed : undefined}
            data-from={[from.x, from.y, from.width, from.height].join(",")}
            data-to={[
              flight.to.x,
              flight.to.y,
              flight.to.width,
              flight.to.height,
            ].join(",")}
            style={{
              left: from.x,
              top: from.y,
              width: from.width,
              height: from.height,
            }}
          >
            {flight.shatter && card
              ? shardLayout(flight.seed).map((shard, i) => (
                  <div
                    key={i}
                    data-piece
                    data-sides={shard.points.length}
                    className={styles.piece}
                    style={{
                      clipPath: clipPath(shard),
                      transformOrigin: `${shard.center[0] * 100}% ${shard.center[1] * 100}%`,
                      backgroundImage: src ? `url(${src})` : undefined,
                    }}
                  />
                ))
              : card && (
                  <>
                    <div className={styles.cardFallback}>{card.name}</div>
                    <img
                      className={styles.cardImage}
                      src={src ?? undefined}
                      alt=""
                      draggable={false}
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  </>
                )}
          </div>
        );
        if (!flight.underPile) return ghost;
        // The pile's top, drawn over a card sent to the deck bottom, so it slides under the pile.
        const { to } = flight;
        return [
          ghost,
          <div
            key={`${flight.id}-cover`}
            className={`${styles.flight} ${styles.flightBack}`}
            data-testid="flight-cover"
            style={{
              left: to.x,
              top: to.y,
              width: to.width,
              height: to.height,
            }}
          />,
        ];
      })}
    </div>
  );
}

/**
 * Animates every board change of one step (M5f): after each commit it reads the board, and when
 * the shown state is one action after the last one (same bottom player), it flies the cards that
 * moved. The arrived cards stay hidden until their flight lands. `onAnimating` reports when
 * flights start and end, so input and the bot wait. A history jump, an undo or a new game shows
 * at once.
 */
export function useMoveAnimations({
  root,
  model,
  step,
  speed,
  onAnimating,
  drop,
}: {
  root: RefObject<HTMLElement | null>;
  model: BoardModel;
  step: number | null;
  speed: AnimationSpeed;
  onAnimating?: ((animating: boolean) => void) | undefined;
  /** Where the last dragged card was let go (set by the board's drag end). */
  drop: RefObject<{ instanceId: string; box: Box; at: number } | null>;
}): Flight[] {
  const prev = useRef<Snapshot | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const hidden = useRef<HTMLElement[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const report = useRef(onAnimating);
  report.current = onAnimating;

  const finish = () => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    for (const el of hidden.current) el.style.visibility = "";
    hidden.current = [];
    setFlights([]);
    report.current?.(false);
  };

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const snap = snapshot(el, model, step);
    const before = prev.current;
    prev.current = snap;
    if (!before || before.step === step) return;
    finish();
    if (
      speed === "off" ||
      step === null ||
      before.step === null ||
      step !== before.step + 1 ||
      before.bottom !== snap.bottom
    )
      return;
    const dropped = drop.current;
    drop.current = null;
    const planned = planFlights(
      before,
      snap,
      destroyedCards(model.view.log, before.logLength),
      dropped && performance.now() - dropped.at < 2000 ? dropped : null,
      bottomedCards(model.view.log, before.logLength),
    );
    if (planned.length === 0) return;
    for (const flight of planned) {
      if (!flight.target) continue;
      const card = el.querySelector<HTMLElement>(
        `[data-testid="card"][data-instance-id="${flight.target}"]`,
      );
      if (card) {
        card.style.visibility = "hidden";
        hidden.current.push(card);
      }
    }
    setFlights(planned);
    report.current?.(true);
    timer.current = setTimeout(finish, flightsTime(planned, speed) + 30);
  });

  // Leaving the board ends any flight.
  useEffect(() => () => finish(), []);
  return flights;
}
