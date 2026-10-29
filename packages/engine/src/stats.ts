import type { Modifier } from "@gojisim/cards";
import { activeCards } from "./abilities";
import {
  abilitiesOf,
  amountOf,
  conditionHolds,
  type Context,
  gatesOpen,
  type Located,
  locate,
  playZoneLimit,
  resolveZoneSet,
  select,
  selectAmong,
} from "./interpreter";
import { cardOf, isBattle, topOf } from "./rules";
import { getPlayer } from "./state";
import type {
  CardInstance,
  CardStatus,
  GameState,
  PlayerId,
  PlayerState,
  ZoneNumber,
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

/** A flag modifier (M1, E13) on a card. */
type FlagModifier = Extract<Modifier, { flag: string; target: unknown }>;

/**
 * Whether any active card's data has a modifier of this kind at all: a quick scan of ability
 * data, with no gates, conditions or selectors. Most games have none, so the flag and play-rule
 * checks that run on every action cost almost nothing (M12b-2 speed fix).
 */
function anyModifier(
  state: GameState,
  kind: (modifier: Modifier) => boolean,
): boolean {
  for (const effect of state.continuousEffects)
    if (effect.flags?.some((f) => kind(f.modifier))) return true;
  for (const { card } of activeCards(state)) {
    const data = abilitiesOf(state, card);
    if (data.status === "manual") continue;
    for (const ability of data.abilities)
      if (ability.kind === "continuous" && ability.modifiers.some(kind))
        return true;
  }
  return false;
}

const isFlag = (flag: string) => (m: Modifier) =>
  "flag" in m && m.flag === flag;

/** Flag modifiers in force that target `card` (M1, E13). */
export function flagsOn(state: GameState, card: CardInstance): FlagModifier[] {
  const found: FlagModifier[] = [];
  // Flags granted for the turn (E19 `grant`), fixed on the cards picked at resolution.
  for (const effect of state.continuousEffects)
    for (const f of effect.flags ?? [])
      if (
        f.instanceId === card.instanceId &&
        "flag" in f.modifier &&
        "target" in f.modifier
      )
        found.push(f.modifier);
  for (const { modifier, context } of activeModifiers(state)) {
    if (!("flag" in modifier) || !("target" in modifier)) continue;
    collecting = true;
    try {
      if (
        select(context, modifier.target).some(
          (l) => l.card.instanceId === card.instanceId,
        )
      )
        found.push(modifier);
    } finally {
      collecting = false;
    }
  }
  return found;
}

export function hasFlag(
  state: GameState,
  card: CardInstance,
  flag: FlagModifier["flag"],
): boolean {
  if (!anyModifier(state, isFlag(flag))) return false;
  return flagsOn(state, card).some((m) => m.flag === flag);
}

/**
 * Whether a counter by `total` counter power fails against the player's monster (E13, 7.4.3):
 * a `counterProof` flag with `atOrBelow` at least the total. `moves`: it moves as though
 * countered instead (5.15.1.1).
 */
export function counterProofAgainst(
  state: GameState,
  player: PlayerState,
  total: number,
): { moves: boolean } | null {
  const top = topOf(player.invadingMonsterZone);
  if (!top || !anyModifier(state, isFlag("counterProof"))) return null;
  const proofs = flagsOn(state, top).filter(
    (m): m is Extract<FlagModifier, { flag: "counterProof" }> =>
      m.flag === "counterProof" &&
      (m.atOrBelow === undefined || total <= m.atOrBelow),
  );
  return proofs.length === 0
    ? null
    : { moves: proofs.some((m) => m.insteadMoves) };
}

/**
 * Whether `player` may play `card` (M1 `cannotPlay`, 8.2, 8.3, Q32), into `zone` for a battle
 * card: from the hand, or by an effect, Evolution included (Q270). A flag with `zones` forbids only
 * those zones. A card in no area yet (a token being made) is checked as though in `zone`.
 */
export function playAllowed(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  zone?: ZoneNumber,
): boolean {
  // M2: a card that can only be played in some zones (EBP04-067).
  const only = playZoneLimit(state, card);
  if (only && zone !== undefined && !only.includes(zone)) return false;
  if (!anyModifier(state, isFlag("cannotPlay"))) return true;
  for (const { modifier, context } of activeModifiers(state)) {
    if (!("flag" in modifier) || modifier.flag !== "cannotPlay") continue;
    collecting = true;
    try {
      const who =
        modifier.player === "any" ||
        (player.id === context.master) === (modifier.player === "you");
      if (!who) continue;
      // `what` is read wherever the card is now: a hand, or a discard pile or deck for an
      // effect that puts it into play (Q32).
      const at: Located =
        locate(state, card.instanceId) ??
        (zone === undefined
          ? { card, player, area: "hand" }
          : { card, player, area: "zones", zone });
      if (
        selectAmong(context, { ...modifier.what, area: at.area }, [at])
          .length === 0
      )
        continue;
      if (!modifier.zones) return false;
      if (
        zone !== undefined &&
        resolveZoneSet(context, modifier.zones, [player]).some(
          (r) => r.player === player.id && r.zone === zone,
        )
      )
        return false;
    } finally {
      collecting = false;
    }
  }
  return true;
}

/** Modifiers in force of a player flag (M1) that applies to `player`, with their contexts. */
function playerFlags<F extends "cannotDraw" | "cannotPayInvasionWith">(
  state: GameState,
  player: PlayerState,
  flag: F,
): { modifier: Extract<Modifier, { flag: F }>; context: Context }[] {
  if (!anyModifier(state, isFlag(flag))) return [];
  return activeModifiers(state).flatMap(({ modifier, context }) =>
    "flag" in modifier &&
    modifier.flag === flag &&
    "player" in modifier &&
    (modifier.player === "any" ||
      (player.id === context.master) === (modifier.player === "you"))
      ? [{ modifier: modifier as Extract<Modifier, { flag: F }>, context }]
      : [],
  );
}

/** Whether `player` can't draw now (M1 `cannotDraw`, EBP04-030: "during the end phase"). */
export function cannotDraw(state: GameState, player: PlayerState): boolean {
  return playerFlags(state, player, "cannotDraw").some(
    ({ modifier }) => modifier.phase === state.phase,
  );
}

/** Whether `player` may discard the hand card `card` for an invasion (8.6.1, EBP04-029). */
export function invasionPayable(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
): boolean {
  for (const { modifier, context } of playerFlags(
    state,
    player,
    "cannotPayInvasionWith",
  )) {
    collecting = true;
    try {
      if (
        select(context, { ...modifier.what, area: "hand" }).some(
          (l) => l.card.instanceId === card.instanceId,
        )
      )
        return false;
    } finally {
      collecting = false;
    }
  }
  return true;
}

/** `playRankReduction` modifiers that target a hand card (M2, EBP02-039). */
export function playRankReduction(
  state: GameState,
  card: CardInstance,
): number {
  if (!anyModifier(state, (m) => "stat" in m && m.stat === "playRankReduction"))
    return 0;
  let total = 0;
  for (const { modifier, context } of activeModifiers(state)) {
    if (!("stat" in modifier) || modifier.stat !== "playRankReduction")
      continue;
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

/** Bonuses from effects that last for the turn (E19, `boost`), by card instance. */
function boostTotal(
  state: GameState,
  card: CardInstance,
  stat: "counterPower" | "threat" | "rank",
): number {
  let total = 0;
  for (const effect of state.continuousEffects)
    for (const bonus of effect.bonuses ?? [])
      if (bonus.instanceId === card.instanceId && bonus.stat === stat)
        total += bonus.amount;
  return total;
}

/** Sum of a stat's modifiers that target `card`. */
function modifierTotal(
  state: GameState,
  card: CardInstance,
  stat: "counterPower" | "threat" | "rank",
): number {
  let total = boostTotal(state, card, stat);
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
/**
 * A printed counter power or threat. An "X" (printed as -1 in the card data) is 0: the card's
 * ability gives the value (C4, EBP03-067).
 */
function printedValue(state: GameState, card: CardInstance): number {
  return Math.max(0, cardOf(state, card).counterOrThreat ?? 0);
}

export function getCounterPower(state: GameState, card: CardInstance): number {
  return printedValue(state, card) + modifierTotal(state, card, "counterPower");
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
  return (
    printedValue(state, top) +
    RAGE_THREAT * player.rage +
    modifierTotal(state, top, "threat")
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
      // A card that cannot engage adds nothing (5.16.1): a status, or a flag (M1).
      if (
        !top ||
        top.statuses?.includes("cannotEngage") ||
        hasFlag(state, top, "cannotEngage")
      )
        continue;
      if (isBattle(cardOf(state, top))) total += getCounterPower(state, top);
    }
  }
  return total + totalCounterPowerBonus(state, player);
}

/** What a change badge chip shows (M5d): the kind, a short label, and the full wording. */
export interface CardChange {
  kind:
    | "burst"
    | "counterPower"
    | "rank"
    | "threat"
    | "playedVia"
    | "counter"
    | "link"
    | CardStatus
    | FlagModifier["flag"];
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
  // A play from the hand is the normal way: no chip.
  hand: null,
  burst: null,
};

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/** Words for each flag (M1, E13); a new flag must name itself here, so it shows on the card. */
function FLAG_CHANGES(flag: FlagModifier): Omit<CardChange, "kind"> {
  switch (flag.flag) {
    case "cannotEngage":
      return STATUS_CHANGES.cannotEngage;
    case "cannotBeDestroyedByOpponent":
      return {
        label: "Protected",
        detail: "Cannot be destroyed by the opponent's effects (5.12)",
      };
    case "counterProof":
      return flag.atOrBelow === undefined
        ? { label: "Counter-proof", detail: "Cannot be countered (7.4.3)" }
        : {
            label: `Counter-proof ≤${flag.atOrBelow}`,
            detail: `Cannot be countered by ${flag.atOrBelow} or lower counter power${flag.insteadMoves ? "; it only moves as though countered (5.15.1.1)" : ""} (7.4.3)`,
          };
    case "cannotAdvance":
      return { label: "Can't advance", detail: "Cannot advance (5.13.1)" };
    case "cannotInvade":
      return { label: "Can't invade", detail: "Cannot invade (8.6)" };
    case "rageCannotBeReducedByOpponent":
      return {
        label: "Rage protected",
        detail: "Its rage cannot be reduced by the opponent's effects (Q16)",
      };
    case "cannotBeMovedByOpponent":
      return {
        label: "Can't be moved",
        detail:
          "Cannot be moved by the opponent's effects; a counter still moves it (5.13, 5.15.1.1)",
      };
    case "staysInStrategyZone":
      return {
        label: "Stays",
        detail:
          "Not sent to the discard pile during its master's start phase (7.2.3)",
      };
  }
}

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
  for (const flag of flagsOn(state, card))
    changes.push({ kind: flag.flag, ...FLAG_CHANGES(flag) });
  const via = card.playedVia ? PLAYED_VIA[card.playedVia] : null;
  if (via) changes.push({ kind: "playedVia", ...via });
  for (const effect of state.continuousEffects) {
    // Q11: rage placed under the card, as a count (EBP04-089).
    if (effect.counter?.instanceId === instanceId)
      changes.push({
        kind: "counter",
        label: `Rage under ${effect.counter.count}`,
        detail: `${effect.counter.count} [rage] placed under this card (Q11)`,
      });
    // EBP04-067: linked to another card; if either leaves its zone or moves, both are destroyed.
    const other = effect.link?.cards.find((c) => c.instanceId !== instanceId);
    if (other && effect.link?.cards.some((c) => c.instanceId === instanceId)) {
      const at = locate(state, other.instanceId);
      changes.push({
        kind: "link",
        label: "Linked",
        detail: `Linked to ${at ? cardOf(state, at.card).name : "a card"} in zone ${other.zone}: if either leaves its zone or moves, both are destroyed`,
      });
    }
  }
  return changes;
}
