import type { Modifier } from "@gojisim/cards";
import { activeCards } from "./abilities";
import {
  abilitiesOf,
  amountOf,
  conditionHolds,
  type Context,
  gatesOpen,
  select,
} from "./interpreter";
import { cardOf, topOf } from "./rules";
import { getPlayer } from "./state";
import type { CardInstance, GameState, PlayerId, PlayerState } from "./types";
import { ZONE_NUMBERS } from "./types";

/** Threat added per point of rage (3.4.5). */
export const RAGE_THREAT = 5000;

/** A continuous modifier in force, with the context of the card that grants it. */
interface ActiveModifier {
  modifier: Modifier;
  context: Context;
}

/**
 * Set while modifiers are being collected. Conditions and selectors read stats too (a rank
 * filter, for example); inside that evaluation they see printed values, so an ability cannot
 * depend on itself (10.8.1.6).
 */
let collecting = false;

/**
 * Continuous modifiers in force (10.8): every active card's continuous abilities whose gates are
 * open (Q7, Q9) and whose condition holds.
 */
function activeModifiers(state: GameState): ActiveModifier[] {
  if (collecting) return [];
  collecting = true;
  try {
    const found: ActiveModifier[] = [];
    for (const { card, master } of activeCards(state)) {
      const data = abilitiesOf(state, card);
      if (data.status === "manual") continue;
      for (const ability of data.abilities) {
        if (ability.kind !== "continuous") continue;
        if (!gatesOpen(state, master, ability.gates)) continue;
        const context: Context = {
          state,
          master,
          sourceInstanceId: card.instanceId,
          bindings: {},
        };
        if (ability.condition && !conditionHolds(context, ability.condition))
          continue;
        for (const modifier of ability.modifiers)
          found.push({ modifier, context });
      }
    }
    return found;
  } finally {
    collecting = false;
  }
}

/** Sum of a stat's modifiers that target `card`. */
function modifierTotal(
  state: GameState,
  card: CardInstance,
  stat: "counterPower" | "threat" | "rank",
): number {
  let total = 0;
  for (const { modifier, context } of activeModifiers(state)) {
    if (!("stat" in modifier) || modifier.stat !== stat) continue;
    collecting = true;
    try {
      if (
        select(context, modifier.target).some(
          (l) => l.card.instanceId === card.instanceId,
        )
      )
        total += amountOf(context, modifier.amount);
    } finally {
      collecting = false;
    }
  }
  return total;
}

/**
 * A card's rank through the 10.8.1 layers: printed rank (layer 1, after errata), then rank
 * modifiers (layer 5). `null` for a card without a rank.
 */
export function getRank(state: GameState, card: CardInstance): number | null {
  const printed = cardOf(state, card).rank;
  return printed === null ? null : printed + modifierTotal(state, card, "rank");
}

/** A battle card's counter power through the 10.8.1 layers: printed, then modifiers (layer 5). */
export function getCounterPower(state: GameState, card: CardInstance): number {
  return (
    (cardOf(state, card).counterOrThreat ?? 0) +
    modifierTotal(state, card, "counterPower")
  );
}

/** The active monster: the top card of the invading monster stack (3.2.3.1). */
export function activeMonster(state: GameState, player: PlayerState) {
  const top = topOf(player.invadingMonsterZone);
  return top ? cardOf(state, top) : null;
}

/**
 * The threat of a player's invading monster, read in the 10.8.1 layer order: printed threat
 * (layer 1), rage at +5,000 per point (layer 4, 3.4.5), then threat modifiers (layer 5).
 */
export function getThreat(state: GameState, playerId: PlayerId): number {
  const player = getPlayer(state, playerId);
  const top = topOf(player.invadingMonsterZone);
  if (!top) return RAGE_THREAT * player.rage;
  const printed = cardOf(state, top).counterOrThreat ?? 0;
  return (
    printed + RAGE_THREAT * player.rage + modifierTotal(state, top, "threat")
  );
}

/** `totalCounterPower` modifiers of abilities `player` is the master of. */
function totalCounterPowerBonus(state: GameState, player: PlayerState): number {
  let total = 0;
  for (const { modifier, context } of activeModifiers(state)) {
    if (!("stat" in modifier) || modifier.stat !== "totalCounterPower")
      continue;
    if (context.master === player.id)
      total += amountOf(context, modifier.amount);
  }
  return total;
}

/**
 * Total counter power of a player's battle cards in zones (7.4.2), each through `getCounterPower`,
 * plus `totalCounterPower` modifiers. Only stacks topped by a battle card count; monster cards in
 * zones add nothing (7.4.2.1), nor do cards that cannot engage (5.16.1).
 */
export function counterPowerOf(state: GameState, player: PlayerState): number {
  let total = 0;
  for (const zone of ZONE_NUMBERS) {
    for (const stack of player.zones[zone]) {
      const top = topOf(stack);
      if (!top || top.statuses?.includes("cannotEngage")) continue;
      if (cardOf(state, top).type === "Battle")
        total += getCounterPower(state, top);
    }
  }
  return total + totalCounterPowerBonus(state, player);
}
