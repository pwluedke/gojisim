import type { Modifier } from "@gojisim/cards";
import { activeCards } from "./abilities";
import {
  abilitiesOf,
  amountOf,
  conditionHolds,
  type Context,
  gatesOpen,
  locate,
  select,
} from "./interpreter";
import { cardOf, topOf } from "./rules";
import { getPlayer } from "./state";
import type {
  CardInstance,
  CardStatus,
  GameState,
  PlayerId,
  PlayerState,
} from "./types";
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

/** What a change badge chip shows (M5d): the kind, a short label, and the full wording. */
export interface CardChange {
  kind: "burst" | "counterPower" | "rank" | "threat" | "playedVia" | CardStatus;
  /** The chip on the card, e.g. "CP +3000". */
  label: string;
  /** The hover list's wording, with its rule number. */
  detail: string;
}

/** Words for each status (5.16). A new status must name itself here, so it shows on the card. */
const STATUS_CHANGES: Record<CardStatus, Omit<CardChange, "kind">> = {
  cannotEngage: {
    label: "Can't engage",
    detail: "Cannot engage: adds no counter power (5.16.1)",
  },
};

/** Words for how a card was played; a Burst play shows as its timed discard instead. */
const PLAYED_VIA: Record<
  NonNullable<CardInstance["playedVia"]>,
  Omit<CardChange, "kind"> | null
> = {
  evolution: { label: "Evolved", detail: "Played through Evolution (5.17)" },
  effect: { label: "By effect", detail: "Played by an effect (5.11)" },
  burst: null,
};

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/**
 * Every change in force on a card (M5d change badge): a pending Burst discard (12.5.2), stat
 * modifiers from the 10.8.1 layers (counter power, rank, threat), statuses, and how it was
 * played. The board shows these as chips, so a new modifier or status appears there with no
 * UI work. Public information only: for cards on the field.
 */
export function cardChanges(
  state: GameState,
  instanceId: string,
): CardChange[] {
  const found = locate(state, instanceId);
  if (!found) return [];
  const { card, player } = found;
  const changes: CardChange[] = [];
  const burst = state.timedTriggers.some(
    (t) => t.kind === "burstDiscard" && t.sourceInstanceId === instanceId,
  );
  if (burst) {
    const stack = player.invadingMonsterZone;
    const index = stack.findIndex((c) => c.instanceId === instanceId);
    const under = index > 0 ? stack[index - 1] : undefined;
    const from = under ? cardOf(state, under).rank : null;
    const label = `Burst R${from ?? "?"}→R${getRank(state, card) ?? "?"} · discard at end phase`;
    changes.push({
      kind: "burst",
      label,
      detail: `${label} (12.5.2)`,
    });
  }
  const stats = [
    ["counterPower", "CP", "Counter power"],
    ["rank", "Rank", "Rank"],
    ["threat", "Threat", "Threat"],
  ] as const;
  for (const [stat, short, long] of stats) {
    const amount = modifierTotal(state, card, stat);
    if (amount !== 0)
      changes.push({
        kind: stat,
        label: `${short} ${signed(amount)}`,
        detail: `${long} ${signed(amount)} from continuous effects (10.8.1)`,
      });
  }
  for (const status of card.statuses ?? [])
    changes.push({ kind: status, ...STATUS_CHANGES[status] });
  const via = card.playedVia ? PLAYED_VIA[card.playedVia] : null;
  if (via) changes.push({ kind: "playedVia", ...via });
  return changes;
}
