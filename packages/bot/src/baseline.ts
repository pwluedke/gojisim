import {
  type Action,
  type GameState,
  isBattle,
  type PlayerView,
  type ZoneNumber,
} from "@gojisim/engine";
import type { Bot } from "./types";

/** A uniform pick in [0, n) from a [0, 1) rng. */
export const pickWith = (rng: () => number) => (n: number) =>
  Math.floor(rng() * n);

/**
 * Weights for the `weighted` policy: first an action type by weight, then a uniform pick within
 * it. It favors battle plays and rage and rarely invades, so counter power builds up and
 * counters (5.15) happen often (decision 124).
 */
export const POLICY_WEIGHTS: Record<Action["type"], number> = {
  playBattle: 32,
  gainRage: 20,
  playMonster: 12,
  activateStrategy: 8,
  pass: 8,
  invade: 1,
  // An invasion paid with the deck's top card (EBP03-004), as rare as a normal one.
  invadeFromDeck: 1,
  choose: 4,
  concede: 0,
  // Manual override actions are never listed, so never chosen.
  manual: 0,
};

/** What the weighted policy reads about the board: from a view, or (in rollouts) a state. */
export interface Board {
  /** Whether the player's zone holds a battle card (a stack topped by one). */
  battleAt(playerId: string, zone: ZoneNumber): boolean;
  monsterPosition(playerId: string): number | null;
}

/** The board as a player's view shows it. */
export function viewBoard(view: PlayerView): Board {
  return {
    battleAt: (playerId, zone) =>
      (
        view.players.find((p) => p.id === playerId)?.zones[zone].cards ?? []
      ).some((stack) => {
        const top = stack[stack.length - 1];
        return top !== undefined && isBattle(view.cards[top.cardId]);
      }),
    monsterPosition: (playerId) =>
      view.players.find((p) => p.id === playerId)?.monsterPosition ?? null,
  };
}

/** The board of a full state (for simulations inside a determinized state). */
export function stateBoard(state: GameState): Board {
  return {
    battleAt: (playerId, zone) =>
      (state.players.find((p) => p.id === playerId)?.zones[zone] ?? []).some(
        (stack) => {
          const top = stack[stack.length - 1];
          return top !== undefined && isBattle(state.cards[top.cardId]);
        },
      ),
    monsterPosition: (playerId) =>
      state.players.find((p) => p.id === playerId)?.monsterPosition ?? null,
  };
}

/** The `weighted` policy's pick. */
export function weightedPick(
  board: Board,
  options: Action[],
  pick: (n: number) => number,
): Action {
  const types = [...new Set(options.map((a) => a.type))];
  const weights = types.map((t) => POLICY_WEIGHTS[t]);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return options[pick(options.length)] as Action;
  let roll = pick(total);
  const type = types.find(
    (_, i) => (roll -= weights[i] as number) < 0,
  ) as Action["type"];
  const ofType = options.filter((a) => a.type === type);
  const battles = ofType.filter((a) => a.type === "playBattle");
  if (battles.length === 0) return ofType[pick(ofType.length)] as Action;
  const playerId = battles[0]?.player ?? "";
  const own = board.monsterPosition(playerId) ?? 1;
  // A battle card in your own zone 8 blocks the opponent's victory through invasion
  // (5.13.1.1.1), so fill an empty zone 8 first. Your own monster crushes it (11.3.3) when it
  // reaches zone 8 at an end phase (7.5.2).
  const toZone8 = battles.filter((a) => a.zone === 8);
  if (toZone8.length > 0 && !board.battleAt(playerId, 8))
    return toZone8[pick(toZone8.length)] as Action;
  // Otherwise prefer an empty zone behind your own monster: it only advances (7.5.2), so a
  // battle card there is not crushed and keeps adding counter power (7.4.2).
  const safe = battles.filter(
    (a) => a.zone < own && !board.battleAt(playerId, a.zone),
  );
  const pool = safe.length > 0 ? safe : battles;
  return pool[pick(pool.length)] as Action;
}

/**
 * The `tactical` play-out policy (M13c): the weighted pick, plus two card-aware rules read from
 * the full simulated state. An invasion that wins now is taken: the paying card's invasion icon
 * (8.6.1.1) carries the monster past zone 8 while the opponent's zone 8 holds no battle card
 * (5.13.1.1). And while the opponent's monster stands in its zone 8 with yours open, a battle card
 * goes into your zone 8 (5.13.1.1.1). Advance-stopping effects aren't read, so a "winning"
 * invasion can still fall short; the rules only steer play-outs.
 */
export function tacticalPick(
  state: GameState,
  options: Action[],
  pick: (n: number) => number,
): Action {
  const playerId = options[0]?.player;
  const me = state.players.find((p) => p.id === playerId);
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!me || !opponent || state.pendingChoice)
    return weightedPick(stateBoard(state), options, pick);
  const board = stateBoard(state);
  const position = me.monsterPosition ?? 0;
  if (!board.battleAt(opponent.id, 8)) {
    const wins = options.filter((a) => {
      if (a.type !== "invade") return false;
      const card = me.hand.find((c) => c.instanceId === a.cardInstanceId);
      const icon = (card && state.cards[card.cardId]?.invadeZones) ?? 0;
      return position + icon > 8;
    });
    if (wins.length > 0) return wins[pick(wins.length)] as Action;
  }
  if (opponent.monsterPosition === 8 && !board.battleAt(me.id, 8)) {
    const blocks = options.filter(
      (a) => a.type === "playBattle" && a.zone === 8,
    );
    if (blocks.length > 0) return blocks[pick(blocks.length)] as Action;
  }
  return weightedPick(board, options, pick);
}

/** The `weighted` policy's pick, from the bot's view only. */
export function weightedChoice(
  view: PlayerView,
  options: Action[],
  pick: (n: number) => number,
): Action {
  return weightedPick(viewBoard(view), options, pick);
}

/** Uniform over the legal actions: the stress test's `uniform` policy. */
export const randomBot: Bot = {
  name: "random",
  chooseAction: ({ legalActions, rng }) =>
    legalActions[pickWith(rng)(legalActions.length)] as Action,
};

/** The stress test's `weighted` policy. */
export const weightedBot: Bot = {
  name: "weighted",
  chooseAction: ({ view, legalActions, rng }) =>
    weightedChoice(view, legalActions, pickWith(rng)),
};
