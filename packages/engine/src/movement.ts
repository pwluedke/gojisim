import { cardOf, crushAndDestroy, topOf } from "./rules";
import { appendLog, getOpponent } from "./state";
import { hasFlag } from "./stats";
import type { GameState, PlayerState, ZoneNumber } from "./types";

export interface AdvanceOptions {
  /** The advance is part of an invasion (5.14); only then can zone 8 win (5.13.1.1.2). */
  invasion: boolean;
  /** Rule that caused the advance, for the log. */
  rule: string;
}

/** Whether a player's zone holds a battle card (a stack topped by one). */
function hasBattleCard(
  state: GameState,
  player: PlayerState,
  zone: ZoneNumber,
): boolean {
  return player.zones[zone].some((stack) => {
    const top = topOf(stack);
    return top !== undefined && cardOf(state, top).type === "Battle";
  });
}

/** Moves the monster one zone and runs crush and destroy on entering (11.3). */
function step(
  state: GameState,
  player: PlayerState,
  to: ZoneNumber,
  type: string,
  rule: string,
  invasion = false,
): void {
  const from = player.monsterPosition;
  player.monsterPosition = to;
  // `invasion` marks an advance step of an invasion, for When invading (12.3, Q4).
  appendLog(state, type, player.id, {
    rule,
    from,
    to,
    ...(invasion ? { invasion: true } : {}),
  });
  crushAndDestroy(state, invasion);
}

/**
 * Advances the invading monster 1 zone (5.13.1). From zone 8 it does not move (5.13.1.1.1),
 * unless this is an invasion and the opponent's zone 8 has no battle card: then its master wins
 * by invasion (5.13.1.1.2) and `state.result` is set. Returns whether it advanced (5.13.3).
 */
export function advanceMonster(
  state: GameState,
  player: PlayerState,
  options: AdvanceOptions,
): boolean {
  const from = player.monsterPosition;
  if (state.result !== null || from === null) return false;
  // M1: "this card cannot advance" overrides every advance, the 7.5.2 one included (1.3.3).
  const top = topOf(player.invadingMonsterZone);
  if (top && hasFlag(state, top, "cannotAdvance")) {
    appendLog(state, "noAdvance", player.id, { rule: "1.3.3", zone: from });
    return false;
  }
  if (from < 8) {
    step(
      state,
      player,
      (from + 1) as ZoneNumber,
      "advance",
      options.rule,
      options.invasion,
    );
    return true;
  }
  const opponent = getOpponent(state, player.id);
  if (options.invasion && !hasBattleCard(state, opponent, 8)) {
    state.result = {
      winner: player.id,
      reason: "invasion",
      rule: "5.13.1.1.2",
    };
    appendLog(state, "gameOver", player.id, {
      rule: "5.13.1.1.2",
      winner: player.id,
      reason: "invasion",
    });
    return false;
  }
  appendLog(state, "noAdvance", player.id, { rule: "5.13.1.1.1", zone: 8 });
  return false;
}

/**
 * Retreats the invading monster 1 zone (5.13.2). In zone 1 nothing happens and it is not
 * considered to have retreated (5.13.2.1). Returns whether it retreated (5.13.3).
 */
export function retreatMonster(
  state: GameState,
  player: PlayerState,
  rule: string,
): boolean {
  const from = player.monsterPosition;
  if (state.result !== null || from === null || from === 1) {
    if (from === 1)
      appendLog(state, "noRetreat", player.id, { rule: "5.13.2.1", zone: 1 });
    return false;
  }
  step(state, player, (from - 1) as ZoneNumber, "retreat", rule);
  return true;
}

/**
 * "Advance to (zone)" (5.13.1.2): nothing if the monster is already beyond that zone (5.13.1.2.1,
 * beyond includes the zone itself, 4.4.5.3.1); otherwise it advances one zone at a time until it
 * gets there, each step counting as one advance (5.13.1.2.2). Returns the number of advances.
 */
export function advanceMonsterTo(
  state: GameState,
  player: PlayerState,
  zone: ZoneNumber,
  options: AdvanceOptions,
): number {
  let advances = 0;
  while (
    player.monsterPosition !== null &&
    player.monsterPosition < zone &&
    state.result === null
  ) {
    if (!advanceMonster(state, player, options)) break;
    advances++;
  }
  return advances;
}

/**
 * "Retreat to (zone)" (5.13.2.2): nothing if the monster is already before that zone
 * (5.13.2.2.1, inclusive); otherwise it retreats one zone at a time until it gets there
 * (5.13.2.2.2). Returns the number of retreats.
 */
export function retreatMonsterTo(
  state: GameState,
  player: PlayerState,
  zone: ZoneNumber,
  rule: string,
): number {
  let retreats = 0;
  while (
    player.monsterPosition !== null &&
    player.monsterPosition > zone &&
    state.result === null
  ) {
    if (!retreatMonster(state, player, rule)) break;
    retreats++;
  }
  return retreats;
}
