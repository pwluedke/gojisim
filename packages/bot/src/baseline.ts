import type { Action, PlayerView, ZoneNumber } from "@gojisim/engine";
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
  choose: 4,
  concede: 0,
  // Manual override actions are never listed, so never chosen.
  manual: 0,
};

/** Whether a player's zone holds a battle card (a stack topped by one), from a view. */
function hasBattleCard(
  view: PlayerView,
  playerId: string,
  zone: ZoneNumber,
): boolean {
  const player = view.players.find((p) => p.id === playerId);
  return (player?.zones[zone].cards ?? []).some((stack) => {
    const top = stack[stack.length - 1];
    return top !== undefined && view.cards[top.cardId]?.type === "Battle";
  });
}

/** The `weighted` policy's pick, from the bot's view only. */
export function weightedChoice(
  view: PlayerView,
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
  const own = view.players.find((p) => p.id === playerId)?.monsterPosition ?? 1;
  // A battle card in your own zone 8 blocks the opponent's victory through invasion
  // (5.13.1.1.1), so fill an empty zone 8 first. Your own monster crushes it (11.3.3) when it
  // reaches zone 8 at an end phase (7.5.2).
  const toZone8 = battles.filter((a) => a.zone === 8);
  if (toZone8.length > 0 && !hasBattleCard(view, playerId, 8))
    return toZone8[pick(toZone8.length)] as Action;
  // Otherwise prefer an empty zone behind your own monster: it only advances (7.5.2), so a
  // battle card there is not crushed and keeps adding counter power (7.4.2).
  const safe = battles.filter(
    (a) => a.zone < own && !hasBattleCard(view, playerId, a.zone),
  );
  const pool = safe.length > 0 ? safe : battles;
  return pool[pick(pool.length)] as Action;
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

/** Bots by name, for the tournament harness. */
export const BOTS: Record<string, Bot> = {
  random: randomBot,
  weighted: weightedBot,
};
