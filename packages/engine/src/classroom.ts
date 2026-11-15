import { applyAction } from "./actions";
import {
  type Action,
  type CardInstance,
  type GameState,
  type PlayerId,
  type PlayerState,
  ZONE_NUMBERS,
} from "./types";

/**
 * Kaiju Classroom (#365): the player plays the bot's turn first, from the bot's seat, and the game
 * compares it with the bot's own turn. Both turns start from the same position (the start of the
 * bot's main phase) and are compared at the moment each ends its main phase (7.3.2's play timing
 * ends, 10.4.4.3), before the counter phase (7.4): the counter check, the opponent's counter-phase
 * plays and the end-phase draw are not part of it.
 *
 * Positions are compared by card (`cardId`), never by instance ids (which change with the order
 * of plays, 4.1.4), so another play order or another copy of the same card still matches. Left
 * out: the order of plays, the log, instance ids, turn flags and pending choices. Different
 * shuffles or draws can make two turns "not same"; the player's rating covers that.
 */

/** One player's board as the comparison reads it. */
export interface BoardPosition {
  /** The invading monster's zone (3.3.3), `null` before setup. */
  monsterZone: number | null;
  /** The invading monster stack (4.7), bottom first, the top card included. */
  monsterStack: number[];
  /** Zones 1 to 8 (4.4): each zone's stacks (ordered within a stack), as a sorted set. */
  zones: Record<number, string[]>;
  /** The strategy cards in the strategy zones (4.5), sorted. */
  strategies: number[];
  /** Rage (3.4). */
  rage: number;
}

/** The position of a classroom turn: the bot's seat in full, the opponent's public side. */
export interface ClassroomPosition {
  seat: PlayerId;
  own: BoardPosition & {
    /** Hand (4.9), discard pile (4.10) and monster deck (4.6) as card multisets (sorted ids). */
    hand: number[];
    discard: number[];
    monsterDeck: number[];
    /** The main deck by count only (4.8; its order and cards are hidden). */
    deckCount: number;
  };
  opponent: BoardPosition & {
    handCount: number;
    discard: number[];
  };
}

const ids = (cards: readonly CardInstance[]) => cards.map((c) => c.cardId);
const sorted = (cards: readonly CardInstance[]) =>
  ids(cards).sort((a, b) => a - b);

function board(player: PlayerState): BoardPosition {
  const zones: Record<number, string[]> = {};
  for (const zone of ZONE_NUMBERS)
    zones[zone] = (player.zones[zone] ?? [])
      .map((stack) => ids(stack).join(","))
      .sort();
  return {
    monsterZone: player.monsterPosition,
    monsterStack: ids(player.invadingMonsterZone),
    zones,
    strategies: player.strategyZones
      .flatMap((zone) => zone.map((p) => p.card.cardId))
      .sort((a, b) => a - b),
    rage: player.rage,
  };
}

/** The comparable position of `state` for the bot's `seat`. */
export function classroomPosition(
  state: GameState,
  seat: PlayerId,
): ClassroomPosition {
  const own = state.players.find((p) => p.id === seat);
  const opp = state.players.find((p) => p.id !== seat);
  if (!own || !opp) throw new Error(`No player ${seat}`);
  return {
    seat,
    own: {
      ...board(own),
      hand: sorted(own.hand),
      discard: sorted(own.discard),
      monsterDeck: sorted(own.monsterDeck),
      deckCount: own.deck.length,
    },
    opponent: {
      ...board(opp),
      handCount: opp.hand.length,
      discard: sorted(opp.discard),
    },
  };
}

/** Where two positions differ, as field paths ("own.hand", "opponent.zones.3"); empty: same. */
export function positionDifferences(
  a: ClassroomPosition,
  b: ClassroomPosition,
): string[] {
  const out: string[] = [];
  const same = (x: unknown, y: unknown) =>
    JSON.stringify(x) === JSON.stringify(y);
  for (const side of ["own", "opponent"] as const) {
    const x = a[side] as unknown as Record<string, unknown>;
    const y = b[side] as unknown as Record<string, unknown>;
    for (const key of Object.keys(x)) {
      if (key === "zones") {
        for (const zone of ZONE_NUMBERS)
          if (!same(a[side].zones[zone], b[side].zones[zone]))
            out.push(`${side}.zones.${zone}`);
      } else if (!same(x[key], y[key])) out.push(`${side}.${key}`);
    }
  }
  return out;
}

/** Whether two turns from the bot's `seat` end in the same position (#365). */
export function samePosition(
  a: GameState,
  b: GameState,
  seat: PlayerId,
): boolean {
  return (
    positionDifferences(classroomPosition(a, seat), classroomPosition(b, seat))
      .length === 0
  );
}

/**
 * Whether `states[index]` is the first state of its turn's main phase (7.3): the main phase,
 * after a state of another phase or turn (or the game's first state).
 */
export function isMainPhaseStart(
  states: readonly GameState[],
  index: number,
): boolean {
  const state = states[index];
  if (!state || state.result || state.phase !== "main") return false;
  const before = states[index - 1];
  return !before || before.phase !== "main" || before.turn !== state.turn;
}

/**
 * The action that ends the main phase begun at `states[from]` (a pass, 10.4.4.3, or an action
 * that ends the game, 1.2.1), and the state right after it, before any counter-phase step runs.
 * `states[i]` is the state before `actions[i]`, as in a session; `null` while the main phase
 * goes on.
 */
export function mainPhaseEnd(
  states: readonly GameState[],
  actions: readonly Action[],
  from: number,
): { index: number; state: GameState } | null {
  const start = states[from];
  if (!start) return null;
  for (let k = from; k < actions.length; k++) {
    const before = states[k];
    const after = states[k + 1];
    const action = actions[k];
    if (!before || !after || !action) return null;
    if (after.result || after.turn !== start.turn || after.phase !== "main")
      return { index: k, state: applyAction(before, action) };
  }
  return null;
}
