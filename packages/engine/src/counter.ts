import { getCardTraits } from "@gojisim/cards";
import { requireChoice } from "./choices";
import { behind } from "./geometry";
import { markLoss } from "./losses";
import { cardOf, crushAndDestroy, topOf } from "./rules";
import { appendLog, getPlayer, moved } from "./state";
import type { CardInstance, GameState, PlayerId, PlayerState } from "./types";
import { ZONE_NUMBERS } from "./types";

/** Threat added per point of rage (3.4.5). */
export const RAGE_THREAT = 5000;

/** The active monster: the top card of the invading monster stack (3.2.3.1). */
export function activeMonster(state: GameState, player: PlayerState) {
  const top = topOf(player.invadingMonsterZone);
  return top ? cardOf(state, top) : null;
}

/** Layer 5 of 10.8.1: continuous effects that change numbers. None exist until M4. */
function applyNumberEffects(
  _state: GameState,
  _playerId: PlayerId,
  _value: "threat",
  base: number,
): number {
  return base;
}

/**
 * The threat of a player's invading monster, read in the 10.8.1 layer order: printed threat
 * (layer 1), rage at +5,000 per point (layer 4, 3.4.5), then number-changing effects (layer 5).
 */
export function getThreat(state: GameState, playerId: PlayerId): number {
  const player = getPlayer(state, playerId);
  const printed = activeMonster(state, player)?.counterOrThreat ?? 0;
  const withRage = printed + RAGE_THREAT * player.rage;
  return applyNumberEffects(state, playerId, "threat", withRage);
}

/**
 * Total counter power of a player's battle cards in zones (7.4.2). Only stacks topped by a battle
 * card count; monster cards in zones add nothing (7.4.2.1), nor do cards that cannot engage (5.16.1).
 */
export function counterPowerOf(state: GameState, player: PlayerState): number {
  let total = 0;
  for (const zone of ZONE_NUMBERS) {
    for (const stack of player.zones[zone]) {
      const top = topOf(stack);
      if (!top || top.statuses?.includes("cannotEngage")) continue;
      const card = cardOf(state, top);
      if (card.type === "Battle") total += card.counterOrThreat ?? 0;
    }
  }
  return total;
}

/** Monster cards that can follow the current monster after a counter (5.15.1.2). */
export function nextMonsterCandidates(
  state: GameState,
  player: PlayerState,
): CardInstance[] {
  const top = topOf(player.invadingMonsterZone);
  const current = top && cardOf(state, top);
  const rank = current?.rank;
  if (!top || rank === null || rank === undefined) return [];
  const traits = new Set(getCardTraits(cardOf(state, top)));
  return player.monsterDeck.filter((card) => {
    const data = cardOf(state, card);
    return (
      data.type === "Monster" &&
      data.rank === rank + 1 &&
      getCardTraits(data).some((trait) => traits.has(trait))
    );
  });
}

/** Makes a monster card from the monster deck the new invading monster, on top (4.7.2). */
export function makeInvadingMonster(
  state: GameState,
  player: PlayerState,
  instanceId: string,
): void {
  const index = player.monsterDeck.findIndex(
    (c) => c.instanceId === instanceId,
  );
  const [card] = player.monsterDeck.splice(index, 1);
  if (!card)
    throw new Error(`Card ${instanceId} is not in ${player.id}'s monster deck`);
  const monster = moved(state, card);
  player.invadingMonsterZone.push(monster);
  appendLog(state, "newInvadingMonster", player.id, {
    rule: "5.15.1.2",
    cardId: monster.cardId,
    zone: player.monsterPosition,
  });
}

/**
 * Counter (5.15): a monster in zone 6, 7 or 8 moves to the zone behind (5.15.1.1; not a
 * retreat). Its master then picks the next monster: one candidate is taken automatically, several
 * make a `nextMonster` choice, none means that player loses (5.15.1.2.1).
 */
export function counterMonster(state: GameState, countered: PlayerState): void {
  appendLog(state, "counter", countered.id, { rule: "5.15.1" });
  const from = countered.monsterPosition;
  const to = from === null ? null : behind(from);
  if (from !== null && to !== null && from >= 6) {
    countered.monsterPosition = to;
    appendLog(state, "moveBehind", countered.id, {
      rule: "5.15.1.1",
      from,
      to,
    });
    crushAndDestroy(state);
  }
  const candidates = nextMonsterCandidates(state, countered);
  const [only] = candidates;
  if (candidates.length === 0) {
    markLoss(state, countered.id, "victoryThroughCountering", "5.15.1.2.1");
  } else if (candidates.length === 1 && only) {
    makeInvadingMonster(state, countered, only.instanceId);
  } else {
    requireChoice(
      state,
      countered.id,
      "nextMonster",
      "5.15.1.2",
      candidates.map((c) => ({
        id: c.instanceId,
        cardId: c.cardId,
        abilityId: null,
      })),
    );
  }
}
