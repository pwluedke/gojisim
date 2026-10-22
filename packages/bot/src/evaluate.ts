import {
  counterPowerOf,
  type GameState,
  getThreat,
  nextMonsterCandidates,
  type PlayerId,
  type PlayerState,
} from "@gojisim/engine";
import weightsJson from "../data/eval-weights.json";

/**
 * Static evaluation for search bots (M6b): a number in [-1, 1] from `player`'s point of view.
 * Terminal states are exact (win 1, loss -1, draw 0). Otherwise each feature is a per-player
 * measure taken as (own minus opponent), so `evaluate(s, P1) === -evaluate(s, P2)`, and the
 * weighted sum is squashed with `tanh`. Weights live in `data/eval-weights.json` (M13 tunes them).
 */

export const FEATURES = [
  "position",
  "blocker",
  "winThreat",
  "countersLeft",
  "counterEdge",
  "nextMonster",
  "rage",
  "hand",
  "battleCards",
  "icon2",
  "strategyFree",
] as const;
export type Feature = (typeof FEATURES)[number];
export type Weights = Record<Feature, number>;

export const DEFAULT_WEIGHTS: Weights = weightsJson;

function players(state: GameState, id: PlayerId): [PlayerState, PlayerState] {
  const me = state.players.find((p) => p.id === id);
  const other = state.players.find((p) => p.id !== id);
  if (!me || !other) throw new Error(`Unknown player ${id}`);
  return [me, other];
}

/** Whether a player's zone holds a battle card (a stack topped by one). */
function battleIn(state: GameState, player: PlayerState, zone: 8): boolean {
  return player.zones[zone].some((stack) => {
    const top = stack[stack.length - 1];
    return top !== undefined && state.cards[top.cardId]?.type === "Battle";
  });
}

/**
 * Per-player measures, each in about [0, 1] (counter edge in [-1, 1]). A feature is the player's
 * measure minus the opponent's.
 */
export const MEASURES: Record<
  Feature,
  (state: GameState, me: PlayerState, opponent: PlayerState) => number
> = {
  /** Invasion race: how far the monster has come (zone 1 to 8). */
  position: (_s, me) => ((me.monsterPosition ?? 1) - 1) / 7,
  /** A battle card in your own zone 8 blocks the opponent's victory through invasion (5.13.1.1.1). */
  blocker: (s, me) => (battleIn(s, me, 8) ? 1 : 0),
  /**
   * In zone 8, the opponent's zone 8 open, and an invasion still available (a card in hand, and
   * not already used this turn): the next invasion wins (5.13.1.1.2).
   */
  winThreat: (s, me, opponent) =>
    me.monsterPosition === 8 &&
    !battleIn(s, opponent, 8) &&
    me.hand.length > 0 &&
    !(s.turnPlayer === me.id && s.turnFlags.invasionUsed)
      ? 1
      : 0,
  /** Counter race: counters left before a loss, 5 minus the current monster's rank. */
  countersLeft: (s, me) => {
    const top = me.invadingMonsterZone[me.invadingMonsterZone.length - 1];
    const rank = (top && s.cards[top.cardId]?.rank) ?? 1;
    return (5 - rank) / 4;
  },
  /** Your counter power against the opponent's threat (7.4.3), clamped to [-1, 1]. */
  counterEdge: (s, me, opponent) =>
    Math.max(
      -1,
      Math.min(1, (counterPowerOf(s, me) - getThreat(s, opponent.id)) / 20000),
    ),
  /** A legal next monster for a counter exists (5.15.1.2); none means the next counter loses. */
  nextMonster: (s, me) => (nextMonsterCandidates(s, me).length > 0 ? 1 : 0),
  /** Rage raises threat (+5,000 each, 3.4.5) and stays through the opponent's turn. */
  rage: (_s, me) => me.rage / 5,
  hand: (_s, me) => me.hand.length / 5,
  /** Battle cards in zones: stacks topped by a battle card. */
  battleCards: (s, me) =>
    Object.values(me.zones)
      .flat()
      .filter((stack) => {
        const top = stack[stack.length - 1];
        return top !== undefined && s.cards[top.cardId]?.type === "Battle";
      }).length / 4,
  /** Cards in hand with invasion icon 2: a two-zone invasion. */
  icon2: (s, me) =>
    me.hand.filter((c) => s.cards[c.cardId]?.invadeZones === 2).length / 2,
  /** Strategy zones free for a strategy card (8.3.2). */
  strategyFree: (_s, me) =>
    me.strategyZones.filter((z) => z.length === 0).length / 2,
};

/** Each feature's value for `player`: own measure minus the opponent's. */
export function features(
  state: GameState,
  player: PlayerId,
): Record<Feature, number> {
  const [me, opponent] = players(state, player);
  return Object.fromEntries(
    FEATURES.map((f) => [
      f,
      MEASURES[f](state, me, opponent) - MEASURES[f](state, opponent, me),
    ]),
  ) as Record<Feature, number>;
}

/** The state's value for `player`, in [-1, 1]. */
export function evaluate(
  state: GameState,
  player: PlayerId,
  weights: Weights = DEFAULT_WEIGHTS,
): number {
  if (state.result !== null) {
    if (state.result.winner === null) return 0;
    return state.result.winner === player ? 1 : -1;
  }
  const values = features(state, player);
  let sum = 0;
  for (const f of FEATURES) sum += weights[f] * values[f];
  return Math.tanh(sum);
}
