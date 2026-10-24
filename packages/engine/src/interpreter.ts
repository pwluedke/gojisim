import {
  type Ability,
  type Amount,
  type CardAbilities,
  type Condition,
  type Count,
  type DelayedAbility,
  type Effect,
  type Gate,
  getCardAbilities,
  getCardTraits,
  type Op,
  type Selector,
  type Trigger,
  type ZoneSet,
} from "@gojisim/cards";
import { confirmsSingleOption, requireChoice } from "./choices";
import {
  behind,
  inFrontOf,
  isAdjacent,
  sameColumn,
  type ZoneRef,
} from "./geometry";
import { activeCards } from "./abilities";
import { cardOf, destroyCards, topOf } from "./rules";
import { shuffleInPlace } from "./rng";
import {
  appendLog,
  drawCards,
  getOpponent,
  getPlayer,
  moved,
  setRage,
  toDiscard,
} from "./state";
import { getCounterPower, getRank, getThreat } from "./stats";
import type {
  Binding,
  CardInstance,
  GameState,
  LogEntry,
  PlayerId,
  PlayerState,
  StandbyAbility,
  ZoneNumber,
} from "./types";
import { ZONE_NUMBERS } from "./types";

/**
 * The ability interpreter (docs/abilities/format.md, engine changes 1 to 3): runs the card ability
 * data from `@gojisim/cards`. Triggered abilities enter standby through `fireTriggers` and resolve
 * here; continuous modifiers are read by `stats.ts`.
 */

// ---------------------------------------------------------------------------------------------
// Ability data lookup

/** Test-only ability data, keyed by `deckCardNumber`, consulted before the set files. */
const testAbilities = new Map<string, CardAbilities>();

export function setTestAbilities(
  deckCardNumber: string,
  data: CardAbilities | null,
): void {
  if (data === null) testAbilities.delete(deckCardNumber);
  else testAbilities.set(deckCardNumber, data);
}

/** A card's ability data; a card with no entry is `manual` (no abilities run). */
export function abilitiesOf(
  state: GameState,
  card: CardInstance,
): CardAbilities {
  const number = cardOf(state, card).deckCardNumber;
  return testAbilities.get(number) ?? getCardAbilities(number);
}

/** Whether the card has ability data (not `manual`), so the engine runs it. */
export function hasAbilityData(state: GameState, card: CardInstance): boolean {
  return abilitiesOf(state, card).status !== "manual";
}

/** Code for `custom` effects (format.md), keyed by handler name. */
export type CustomEffect = (state: GameState, context: Context) => void;
const customEffects = new Map<string, CustomEffect>();

export function registerCustomEffect(
  handler: string,
  run: CustomEffect | null,
): void {
  if (run === null) customEffects.delete(handler);
  else customEffects.set(handler, run);
}

/** Standby ability ids of data abilities: `<deckCardNumber>#<ability id>`. */
export function dataAbilityId(deckCardNumber: string, id: string): string {
  return `${deckCardNumber}#${id}`;
}

// ---------------------------------------------------------------------------------------------
// Context, locations

/** What an ability sees while it is checked or resolved. */
export interface Context {
  state: GameState;
  master: PlayerId;
  /** The card carrying the ability (it may have left its area, 10.5.2.3.3). */
  sourceInstanceId: string;
  bindings: Record<string, Binding>;
}

/** Where a card is now. `zone` is set for zones and for the invading monster (3.3.3.2). */
export interface Located {
  card: CardInstance;
  player: PlayerState;
  area: Selector["area"];
  zone?: ZoneNumber;
}

/** Every card in an area of a player, with its location. Zones and the monster give top cards only. */
function cardsIn(player: PlayerState, area: Selector["area"]): Located[] {
  const at = (card: CardInstance, zone?: ZoneNumber): Located =>
    zone === undefined ? { card, player, area } : { card, player, area, zone };
  switch (area) {
    case "zones":
      return ZONE_NUMBERS.flatMap((zone) =>
        player.zones[zone].flatMap((stack) => {
          const top = topOf(stack);
          return top ? [at(top, zone)] : [];
        }),
      );
    case "monster": {
      const top = topOf(player.invadingMonsterZone);
      return top ? [at(top, player.monsterPosition ?? undefined)] : [];
    }
    case "strategy":
      return player.strategyZones.flatMap((placements) =>
        placements.map((p) => at(p.card)),
      );
    case "under":
      return [
        ...ZONE_NUMBERS.flatMap((zone) =>
          player.zones[zone].flatMap((stack) =>
            stack.slice(0, -1).map((c) => at(c, zone)),
          ),
        ),
        ...player.invadingMonsterZone.slice(0, -1).map((c) => at(c)),
      ];
    case "hand":
      return player.hand.map((c) => at(c));
    case "deck":
      return player.deck.map((c) => at(c));
    case "discard":
      return player.discard.map((c) => at(c));
    case "monsterDeck":
      return player.monsterDeck.map((c) => at(c));
    case "bound":
      return [];
  }
}

/** Finds a card instance anywhere a selector can look. */
export function locate(
  state: GameState,
  instanceId: string,
): Located | undefined {
  const areas: Selector["area"][] = [
    "zones",
    "monster",
    "strategy",
    "under",
    "hand",
    "discard",
    "deck",
    "monsterDeck",
  ];
  for (const player of state.players)
    for (const area of areas) {
      const found = cardsIn(player, area).find(
        (l) => l.card.instanceId === instanceId,
      );
      if (found) return found;
    }
  return undefined;
}

function players(
  ctx: Context,
  ref: "you" | "opponent" | "any" | "each",
): PlayerState[] {
  const you = getPlayer(ctx.state, ctx.master);
  const opponent = getOpponent(ctx.state, ctx.master);
  if (ref === "you") return [you];
  if (ref === "opponent") return [opponent];
  return [you, opponent];
}

export function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">=":
      return a >= b;
    case ">":
      return a > b;
  }
}

// ---------------------------------------------------------------------------------------------
// Zone sets

type Anchor = "this" | "yourMonster" | "opponentMonster" | { bound: string };

/** The zone an anchor names: the source's zone, a monster's position, or a bound zone or card. */
function anchorZone(ctx: Context, of: Anchor): ZoneRef | null {
  const { state } = ctx;
  if (of === "this") {
    const found = locate(state, ctx.sourceInstanceId);
    return found?.zone !== undefined
      ? { player: found.player.id, zone: found.zone }
      : null;
  }
  if (of === "yourMonster" || of === "opponentMonster") {
    const player =
      of === "yourMonster"
        ? getPlayer(state, ctx.master)
        : getOpponent(state, ctx.master);
    return player.monsterPosition === null
      ? null
      : { player: player.id, zone: player.monsterPosition };
  }
  const binding = ctx.bindings[of.bound];
  if (binding?.kind === "zone")
    return { player: binding.player, zone: binding.zone };
  if (binding?.kind === "cards") {
    const first = binding.cards[0];
    const found = first && locate(state, first.instanceId);
    if (found?.zone !== undefined)
      return { player: found.player.id, zone: found.zone };
  }
  return null;
}

function allZones(state: GameState): ZoneRef[] {
  return state.players.flatMap((p) =>
    ZONE_NUMBERS.map((zone) => ({ player: p.id, zone })),
  );
}

/**
 * The zones a zone set names. A list of numbers, `any` and `unoccupied` are zones of `owners`;
 * relations are geometry from the spec (4.4.5) and can cross to the other player's field.
 * `unoccupied` never includes the owner's monster's zone (Q5).
 */
export function resolveZoneSet(
  ctx: Context,
  set: ZoneSet,
  owners: PlayerState[],
): ZoneRef[] {
  if (Array.isArray(set))
    return owners.flatMap((p) => set.map((zone) => ({ player: p.id, zone })));
  if (set === "any")
    return owners.flatMap((p) =>
      ZONE_NUMBERS.map((zone) => ({ player: p.id, zone })),
    );
  if (set === "unoccupied")
    return owners.flatMap((p) =>
      ZONE_NUMBERS.filter(
        (z) => p.zones[z].length === 0 && z !== p.monsterPosition,
      ).map((zone) => ({
        player: p.id,
        zone,
      })),
    );
  const anchor = anchorZone(ctx, set.of);
  if (anchor === null) return [];
  const refs: ZoneRef[] = [];
  if (set.relation === "adjacentTo")
    refs.push(...allZones(ctx.state).filter((r) => isAdjacent(anchor, r)));
  else if (set.relation === "sameColumnAs")
    refs.push(...allZones(ctx.state).filter((r) => sameColumn(anchor, r)));
  else {
    const zone =
      set.relation === "inFrontOf"
        ? inFrontOf(anchor.zone)
        : behind(anchor.zone);
    if (zone !== null) refs.push({ player: anchor.player, zone });
  }
  if (set.includeSelf) refs.push(anchor);
  return refs;
}

const hasZone = (
  refs: ZoneRef[],
  player: PlayerId,
  zone: ZoneNumber | undefined,
) =>
  zone !== undefined &&
  refs.some((r) => r.player === player && r.zone === zone);

// ---------------------------------------------------------------------------------------------
// Selectors

function hasKeyword(
  state: GameState,
  card: CardInstance,
  keyword: string,
): boolean {
  const data = abilitiesOf(state, card);
  if (
    data.abilities.some(
      (a) => a.kind === "keyword" && a.keyword.name === keyword,
    )
  )
    return true;
  // Cards without data yet: the printed keyword icon.
  return cardOf(state, card)
    .text.toLowerCase()
    .includes(`[${keyword.toLowerCase()}`);
}

function boundValue(
  ctx: Context,
  ref: { ref: string; field: "rank" | "counterPower" | "threat" },
): number {
  const binding = ctx.bindings[ref.ref];
  if (binding?.kind !== "cards") throw new Error(`No card bound as ${ref.ref}`);
  return binding.cards[0]?.[ref.field] ?? 0;
}

/** The cards a selector picks, from the source's point of view. */
export function select(ctx: Context, selector: Selector): Located[] {
  const { state } = ctx;
  const owners = players(ctx, selector.owner);
  let found: Located[];
  if (selector.area === "bound") {
    const binding = selector.bind ? ctx.bindings[selector.bind] : undefined;
    found =
      binding?.kind === "cards"
        ? binding.cards.flatMap((c) => {
            const at = locate(state, c.instanceId);
            return at ? [at] : [];
          })
        : [];
    found = found.filter((l) => owners.includes(l.player));
  } else found = owners.flatMap((p) => cardsIn(p, selector.area));

  const zoneRefs = selector.zones
    ? resolveZoneSet(ctx, selector.zones, owners)
    : null;
  return found.filter(({ card, player, zone, area }) => {
    const data = cardOf(state, card);
    if (selector.this && card.instanceId !== ctx.sourceInstanceId) return false;
    if (selector.other && card.instanceId === ctx.sourceInstanceId)
      return false;
    if (selector.type && data.type !== selector.type) return false;
    if (selector.name && data.name !== selector.name) return false;
    if (selector.nameIncludes && !data.name.includes(selector.nameIncludes))
      return false;
    if (selector.traits) {
      const traits = getCardTraits(data);
      if (!selector.traits.every((t) => traits.includes(t))) return false;
    }
    if (selector.anyTraits) {
      const traits = getCardTraits(data);
      if (!selector.anyTraits.some((t) => traits.includes(t))) return false;
    }
    if (
      selector.invadeIcon !== undefined &&
      (data.invadeZones ?? 0) !== selector.invadeIcon
    )
      return false;
    if (selector.threat) {
      if (data.type !== "Monster") return false;
      // The invading monster's threat is its player's threat (3.3.4); elsewhere, the printed one.
      const threat =
        area === "monster"
          ? getThreat(state, player.id)
          : (data.counterOrThreat ?? 0);
      if (!compare(threat, selector.threat.op, selector.threat.value))
        return false;
    }
    if (selector.counterPower) {
      if (data.type !== "Battle") return false;
      const power = getCounterPower(state, card);
      if (
        !compare(power, selector.counterPower.op, selector.counterPower.value)
      )
        return false;
    }
    if (selector.keyword && !hasKeyword(state, card, selector.keyword))
      return false;
    if (
      selector.colors &&
      !selector.colors.some((c) => data.colors.includes(c))
    )
      return false;
    if (selector.rank) {
      const rank = getRank(state, card);
      const value =
        typeof selector.rank.value === "number"
          ? selector.rank.value
          : boundValue(ctx, selector.rank.value);
      if (rank === null || !compare(rank, selector.rank.op, value))
        return false;
    }
    if (zoneRefs && !hasZone(zoneRefs, player.id, zone)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Conditions, amounts, gates

export function amountOf(ctx: Context, amount: Amount): number {
  if (typeof amount === "number") return amount;
  if ("per" in amount) return select(ctx, amount.per).length * amount.times;
  const sum = (
    ref: "you" | "opponent" | "any",
    value: (p: PlayerState) => number,
  ) => players(ctx, ref).reduce((total, p) => total + value(p), 0);
  if ("rageOf" in amount)
    return sum(amount.rageOf, (p) => p.rage) * amount.times;
  if ("monsterRankOf" in amount)
    return (
      sum(amount.monsterRankOf, (p) => {
        const top = topOf(p.invadingMonsterZone);
        return (top && getRank(ctx.state, top)) ?? 0;
      }) * amount.times
    );
  if ("unoccupiedZonesOf" in amount)
    return (
      sum(
        amount.unoccupiedZonesOf,
        (p) =>
          ZONE_NUMBERS.filter(
            (z) => p.zones[z].length === 0 && z !== p.monsterPosition,
          ).length,
      ) * amount.times
    );
  return boundValue(ctx, amount);
}

/** How many cards "exactly N" asks for; N may be an amount read now (C6). */
function exactCount(ctx: Context, count: Extract<Count, { exact: unknown }>) {
  return typeof count.exact === "number"
    ? count.exact
    : Math.max(0, amountOf(ctx, count.exact));
}

export function conditionHolds(ctx: Context, condition: Condition): boolean {
  const { state } = ctx;
  if ("all" in condition)
    return condition.all.every((c) => conditionHolds(ctx, c));
  if ("any" in condition)
    return condition.any.some((c) => conditionHolds(ctx, c));
  if ("not" in condition) return !conditionHolds(ctx, condition.not);
  if ("rage" in condition)
    return players(ctx, condition.rage).some((p) =>
      compare(p.rage, condition.op, condition.value),
    );
  if ("zoneOf" in condition) {
    const subject = anchorZone(ctx, condition.zoneOf);
    if (subject === null) return false;
    const refs = resolveZoneSet(ctx, condition.in, [
      getPlayer(state, subject.player),
    ]);
    return hasZone(refs, subject.player, subject.zone);
  }
  if ("count" in condition)
    return compare(
      select(ctx, condition.count).length,
      condition.op,
      condition.value,
    );
  if ("monsterRank" in condition)
    return players(ctx, condition.monsterRank).some((p) => {
      const top = topOf(p.invadingMonsterZone);
      const rank = top ? getRank(state, top) : null;
      return rank !== null && compare(rank, condition.op, condition.value);
    });
  if ("playedVia" in condition) {
    const via = locate(state, ctx.sourceInstanceId)?.card.playedVia;
    // A Burst play is a play from the hand too (12.5.2, C7).
    if (condition.playedVia === "hand")
      return via === "hand" || via === "burst";
    return via === condition.playedVia;
  }
  throw new Error("not implemented: condition didLastStep");
}

/** Whether every gate is open (turn: Q9, Awakening: 12.4). */
export function gatesOpen(
  state: GameState,
  master: PlayerId,
  gates: Gate[] | undefined,
): boolean {
  return (gates ?? []).every((gate) => {
    if (gate.gate === "turn")
      return (state.turnPlayer === master) === (gate.whose === "yours");
    const position = getPlayer(state, master).monsterPosition;
    return position !== null && position >= gate.zone;
  });
}

// ---------------------------------------------------------------------------------------------
// Triggers

/** Whether `event` fulfils a trigger of the card `source` (10.6.2). Unbuilt triggers never match. */
function triggerMatches(
  state: GameState,
  trigger: Trigger,
  event: LogEntry,
  source: CardInstance,
  master: PlayerId,
): boolean {
  const own = event.payload["instanceId"] === source.instanceId;
  switch (trigger.on) {
    case "enter":
      // Played (12.2): placed from the resolution area or by an effect (5.11.1), or made the new
      // invading monster after a counter (5.11.2, Paul's ruling). Setup placement is not a play.
      return (
        own &&
        ((event.type === "place" &&
          (event.payload["from"] === "resolutionArea" ||
            event.payload["played"] === true) &&
          !String(event.payload["to"]).startsWith("strategy")) ||
          event.type === "newInvadingMonster")
      );
    case "invading": {
      // Once per advance step of an invasion, by this invading monster (12.3, 12.3.2.1, Q4).
      const top = topOf(getPlayer(state, master).invadingMonsterZone);
      return (
        event.type === "advance" &&
        event.payload["invasion"] === true &&
        event.player === master &&
        top?.instanceId === source.instanceId
      );
    }
    case "cardPlayed": {
      // A main phase play (from the resolution area), an effect play, or a new invading monster
      // (5.11), by the given player, of a card the selector picks.
      const played =
        (event.type === "place" &&
          (event.payload["from"] === "resolutionArea" ||
            event.payload["played"] === true)) ||
        event.type === "newInvadingMonster";
      const by =
        trigger.by === "any" ||
        (event.player === master) === (trigger.by === "you");
      if (!played || !by) return false;
      const ctx: Context = {
        state,
        master,
        sourceInstanceId: source.instanceId,
        bindings: {},
      };
      return select(ctx, trigger.what).some(
        (l) => l.card.instanceId === event.payload["instanceId"],
      );
    }
    case "placedInStrategyZone":
      return (
        own &&
        event.type === "place" &&
        String(event.payload["to"]).startsWith("strategy zone")
      );
    case "phaseBegins": {
      if (
        event.type !== "phaseBegins" ||
        event.payload["phase"] !== trigger.phase
      )
        return false;
      const yours = state.turnPlayer === master;
      return (
        trigger.whose === "either" || yours === (trigger.whose === "yours")
      );
    }
    case "rageChanged": {
      if (event.type !== "rageChanged") return false;
      const whose =
        trigger.whose === "any" ||
        (event.player === master) === (trigger.whose === "you");
      const from = Number(event.payload["from"]);
      const to = Number(event.payload["to"]);
      const change =
        trigger.change === "increased"
          ? to > from
          : trigger.change === "reduced"
            ? to < from
            : to === 0 && from > 0;
      return whose && change;
    }
    case "destroyed": {
      if (event.type !== "destroy") return false;
      const cause =
        event.payload["rule"] === "11.3"
          ? "crush"
          : event.payload["rule"] === "11.5"
            ? "overload"
            : "effect";
      if (trigger.cause && trigger.cause !== cause) return false;
      if (trigger.invasion && event.payload["invasion"] !== true) return false;
      if (trigger.by) {
        const by = event.payload["by"];
        if (typeof by !== "string" || !isPlayer(trigger.by, by, master))
          return false;
      }
      return lastKnownMatches(state, trigger.what, event, source, master);
    }
    case "discarded": {
      const fromHand = event.type === "discard";
      const fromStrategy =
        event.type === "discardStrategy" ||
        (event.type === "destroy" && event.payload["area"] === "strategy zone");
      if (trigger.from === "hand" ? !fromHand : !fromStrategy) return false;
      if (trigger.cause && discardCause(event) !== trigger.cause) return false;
      if (trigger.byOpponentEffect) {
        const by = event.payload["by"];
        if (typeof by !== "string" || by === event.player) return false;
      }
      // The card is in its owner's discard pile now; a destroyed strategy card is matched by
      // its last known information.
      if (event.type === "destroy")
        return lastKnownMatches(state, trigger.what, event, source, master);
      const ctx: Context = {
        state,
        master,
        sourceInstanceId: source.instanceId,
        bindings: {},
      };
      return select(ctx, { ...trigger.what, area: "discard" }).some(
        (l) => l.card.instanceId === event.payload["instanceId"],
      );
    }
    case "countered": {
      if (event.type !== "counter" || event.player === null) return false;
      if (trigger.whose === "this") {
        // Logged before the next monster comes in, so the countered card is still on top.
        const top = topOf(getPlayer(state, event.player).invadingMonsterZone);
        return event.player === master && top?.instanceId === source.instanceId;
      }
      return isPlayer(trigger.whose, event.player, master);
    }
    case "advanced": {
      if (event.type !== "advance" || event.player === null) return false;
      const mover = getPlayer(state, event.player);
      if (trigger.whose === "this") {
        const top = topOf(mover.invadingMonsterZone);
        if (event.player !== master || top?.instanceId !== source.instanceId)
          return false;
      } else if (!isPlayer(trigger.whose, event.player, master)) return false;
      const to = Number(event.payload["to"]) as ZoneNumber;
      if (trigger.toZone !== undefined && to !== trigger.toZone) return false;
      if (trigger.during && state.phase !== trigger.during) return false;
      if (trigger.intoColumnOf) {
        const other = getOpponent(state, mover.id);
        if (
          other.monsterPosition === null ||
          !sameColumn(
            { player: mover.id, zone: to },
            { player: other.id, zone: other.monsterPosition },
          )
        )
          return false;
      }
      return true;
    }
    case "invades": {
      if (event.type !== "invasionDone" || event.player === null) return false;
      if (!isPlayer(trigger.whose, event.player, master)) return false;
      if (!trigger.intoZones) return true;
      const from = Number(event.payload["from"]);
      const to = Number(event.payload["to"]);
      return trigger.intoZones.some((zone) => zone > from && zone <= to);
    }
    default:
      return false;
  }
}

/** Whether `player` is `ref` ("you", "opponent" or "any") from `master`'s side. */
function isPlayer(
  ref: "you" | "opponent" | "any",
  player: PlayerId,
  master: PlayerId,
): boolean {
  return ref === "any" || (player === master) === (ref === "you");
}

/** Why a card went from a hand to the discard pile: an effect, a cost, an invasion or rage. */
function discardCause(
  event: LogEntry,
): "effect" | "cost" | "invasion" | "rage" {
  if (event.payload["cost"] === true) return "cost";
  if (event.payload["rule"] === "8.6.1") return "invasion";
  if (event.payload["rule"] === "8.4.1") return "rage";
  return "effect";
}

/**
 * Whether a destroyed card matches a selector by its last known information on the field
 * (10.6.4.1.2): its owner, card information, rank and zone when it was destroyed. `this` is the
 * card itself (the source is then the card in the discard pile, so it never matches here).
 */
function lastKnownMatches(
  state: GameState,
  what: Selector,
  event: LogEntry,
  source: CardInstance,
  master: PlayerId,
): boolean {
  const ids = event.payload["cardIds"];
  const cardId = Array.isArray(ids) ? ids[ids.length - 1] : undefined;
  const data = cardId === undefined ? undefined : state.cards[String(cardId)];
  if (!data || event.player === null) return false;
  if (
    what.owner !== "any" &&
    (event.player === master) !== (what.owner === "you")
  )
    return false;
  const zoneValue =
    event.payload["zone"] ??
    String(event.payload["area"] ?? "").match(/^zone (\d)$/)?.[1];
  const zone =
    zoneValue === undefined ? undefined : (Number(zoneValue) as ZoneNumber);
  const area = zone !== undefined ? "zones" : "strategy";
  if (what.area !== area) return false;
  const instanceId = event.payload["instanceId"];
  if (what.this && instanceId !== source.instanceId) return false;
  if (what.other && instanceId === source.instanceId) return false;
  if (what.type && data.type !== what.type) return false;
  if (what.name && data.name !== what.name) return false;
  if (what.nameIncludes && !data.name.includes(what.nameIncludes)) return false;
  const traits = getCardTraits(data);
  if (what.traits && !what.traits.every((x) => traits.includes(x)))
    return false;
  if (what.anyTraits && !what.anyTraits.some((x) => traits.includes(x)))
    return false;
  if (what.colors && !what.colors.some((c) => data.colors.includes(c)))
    return false;
  if (
    what.keyword &&
    !data.text.toLowerCase().includes(`[${what.keyword.toLowerCase()}`)
  )
    return false;
  if (what.rank) {
    const rank = event.payload["rank"];
    if (
      typeof rank !== "number" ||
      typeof what.rank.value !== "number" ||
      !compare(rank, what.rank.op, what.rank.value)
    )
      return false;
  }
  if (what.zones) {
    if (zone === undefined) return false;
    const ctx: Context = {
      state,
      master,
      sourceInstanceId: source.instanceId,
      bindings: {},
    };
    const owner = getPlayer(state, event.player);
    if (!hasZone(resolveZoneSet(ctx, what.zones, [owner]), owner.id, zone))
      return false;
  }
  return true;
}

/**
 * Data abilities of an active card that `event` triggers, with their gates open (Q7, Q9). Each
 * becomes one standby entry (10.6.2.1).
 */
export function dataTriggers(
  state: GameState,
  event: LogEntry,
  source: CardInstance,
  master: PlayerId,
  area: "field" | "hand" | "discard" = "field",
): Extract<Ability, { kind: "triggered" }>[] {
  const data = abilitiesOf(state, source);
  if (data.status === "manual") return [];
  return withKeywords(data.abilities).filter(
    (a): a is Extract<Ability, { kind: "triggered" }> =>
      a.kind === "triggered" &&
      // Outside the field only abilities that say so are active (10.3.4, T3).
      (area === "field" || (a.activeIn?.includes(area) ?? false)) &&
      triggerMatches(state, a.trigger, event, source, master) &&
      gatesOpen(state, master, a.gates),
  );
}

/** Whether a hand or discard pile card has an ability active there (T3), to skip the rest fast. */
export function activeOutsideField(
  state: GameState,
  card: CardInstance,
  area: "hand" | "discard",
): boolean {
  const data = abilitiesOf(state, card);
  return (
    data.status !== "manual" &&
    data.abilities.some(
      (a) => a.kind === "triggered" && (a.activeIn?.includes(area) ?? false),
    )
  );
}

/**
 * Whether `event` fulfils a delayed ability's trigger (T8, 10.6.5). It is checked whether or not
 * its card is still active; gates read its master's state.
 */
export function delayedTriggers(
  state: GameState,
  event: LogEntry,
  timed: Extract<GameState["timedTriggers"][number], { kind: "delayed" }>,
): boolean {
  const ability = delayedAbility(state, timed.sourceCardId, timed.abilityId);
  const source: CardInstance = {
    instanceId: timed.sourceInstanceId,
    cardId: timed.sourceCardId,
    owner: timed.master,
  };
  return (
    triggerMatches(state, ability.trigger, event, source, timed.master) &&
    gatesOpen(state, timed.master, ability.gates)
  );
}

/** The abilities `until` effects of a card create, at any depth (T8). */
function delayedAbilitiesOf(abilities: Ability[]): DelayedAbility[] {
  const found: DelayedAbility[] = [];
  const visit = (effects: Effect[]) => {
    for (const effect of effects) {
      if (effect.effect === "until")
        for (const ability of effect.abilities) {
          found.push(ability);
          visit(ability.effects);
        }
      if ("effects" in effect) visit(effect.effects);
    }
  };
  for (const ability of abilities)
    if (ability.kind === "triggered") {
      visit(ability.effects);
      if (ability.cost) visit(ability.cost.effects);
    }
  return found;
}

function delayedAbility(
  state: GameState,
  cardId: number,
  abilityId: string,
): DelayedAbility {
  const card = state.cards[cardId];
  const [, id] = abilityId.split("#");
  const data =
    card &&
    (testAbilities.get(card.deckCardNumber) ??
      getCardAbilities(card.deckCardNumber));
  const ability =
    data && delayedAbilitiesOf(data.abilities).find((a) => a.id === id);
  if (!ability) throw new Error(`No delayed ability ${abilityId}`);
  return ability;
}

// ---------------------------------------------------------------------------------------------
// Resolution

type TriggeredAbility = Extract<Ability, { kind: "triggered" }>;

function findAbility(
  state: GameState,
  standby: StandbyAbility,
): TriggeredAbility {
  const [number, id] = standby.abilityId.split("#");
  const card = state.cards[standby.sourceCardId];
  const data =
    card &&
    (testAbilities.get(card.deckCardNumber) ??
      getCardAbilities(card.deckCardNumber));
  const ability =
    data &&
    ([
      ...withKeywords(data.abilities),
      ...delayedAbilitiesOf(data.abilities),
    ].find((a) => "id" in a && a.id === id) as TriggeredAbility | undefined);
  if (
    !ability ||
    ability.kind !== "triggered" ||
    number !== card?.deckCardNumber
  )
    throw new Error(`No triggered ability ${standby.abilityId}`);
  return ability;
}

/**
 * The card's abilities with keywords expanded into the abilities they stand for. Evolution
 * (12.6.2): "at the beginning of your main phase, you may search ..." becomes an optional trigger
 * whose `evolve` effect searches by this card's rank and trait. Burst is handled by the play
 * action and a timed trigger (12.5).
 */
export function withKeywords(abilities: Ability[]): Ability[] {
  return abilities.flatMap((ability): Ability[] => {
    if (ability.kind !== "keyword" || ability.keyword.name !== "evolution")
      return [ability];
    return [
      {
        kind: "triggered",
        id: "evolution",
        optional: true,
        trigger: { on: "phaseBegins", phase: "main", whose: "yours" },
        effects: [
          {
            effect: "evolve",
            target: { owner: "you", area: "zones", this: true },
          },
        ],
      },
    ];
  });
}

/** A card's Evolution keyword (12.6), if its data has one. */
function evolutionOf(
  state: GameState,
  card: CardInstance,
): { rank: number; trait: string } | null {
  for (const ability of abilitiesOf(state, card).abilities)
    if (ability.kind === "keyword" && ability.keyword.name === "evolution")
      return { rank: ability.keyword.rank, trait: ability.keyword.trait };
  return null;
}

/** A card's Burst rank (12.5), if its data has one. */
export function burstRankOf(
  state: GameState,
  card: CardInstance,
): number | null {
  for (const ability of abilitiesOf(state, card).abilities)
    if (ability.kind === "keyword" && ability.keyword.name === "burst")
      return ability.keyword.rank;
  return null;
}

/**
 * Resolves Burst's timed trigger (12.5.2): the card leaves the invading monster for the discard
 * pile, even if it isn't on top (12.5.2.1). The card below becoming the top is not an entry
 * (12.5.3): nothing is placed, so no [enter] or `cardPlayed`.
 */
export function resolveBurstDiscard(
  state: GameState,
  standby: StandbyAbility,
): void {
  const player = getPlayer(state, standby.master);
  const index = player.invadingMonsterZone.findIndex(
    (c) => c.instanceId === standby.sourceInstanceId,
  );
  if (index < 0) {
    appendLog(state, "burstDiscard", player.id, {
      rule: "12.5.2",
      cardId: standby.sourceCardId,
      gone: true,
    });
    return;
  }
  const [card] = player.invadingMonsterZone.splice(index, 1);
  toDiscard(state, card as CardInstance);
  appendLog(state, "burstDiscard", player.id, {
    rule: "12.5.2",
    cardId: standby.sourceCardId,
    wasTop: index === player.invadingMonsterZone.length,
  });
}

function contextOf(state: GameState): Context {
  const r = state.resolution;
  if (!r) throw new Error("No resolution in progress");
  return {
    state,
    master: r.standby.master,
    sourceInstanceId: r.standby.sourceInstanceId,
    bindings: r.bindings,
  };
}

/**
 * Resolves a data ability from standby (10.6.3): gates again (Q7), its condition, "use this
 * ability?" for an optional one, its cost (Q2, 10.5.4), then its effects in order. A choice
 * pauses it in `state.resolution`; `resumeResolution` continues.
 */
export function resolveDataAbility(
  state: GameState,
  standby: StandbyAbility,
): void {
  const ability = findAbility(state, standby);
  if (!gatesOpen(state, standby.master, ability.gates)) {
    appendLog(state, "abilityInactive", standby.master, {
      rule: "10.3.2",
      abilityId: standby.abilityId,
    });
    return;
  }
  state.resolution = {
    standby,
    stage: ability.optional ? "useAbility" : ability.cost ? "payCost" : "main",
    path: [0],
    bindings: {},
    chosen: [],
    zonePicks: [],
    answer: null,
    replacementPicks: [],
    subject: null,
  };
  bindTriggerCard(state, ability.trigger, standby.event);
  if (
    ability.condition &&
    !conditionHolds(contextOf(state), ability.condition)
  ) {
    endResolution(state);
    appendLog(state, "conditionNotMet", standby.master, {
      rule: "10.5.2.3.3",
      abilityId: standby.abilityId,
    });
    return;
  }
  runResolution(state);
}

/**
 * Binds the card a trigger names with `as` (T1, T3): a destroyed card by its last known
 * information (10.6.4.1.2), a discarded card as it is in the discard pile.
 */
function bindTriggerCard(
  state: GameState,
  trigger: Trigger,
  event: LogEntry,
): void {
  if (
    (trigger.on !== "destroyed" && trigger.on !== "discarded") ||
    !trigger.as ||
    !state.resolution
  )
    return;
  const ids = event.payload["cardIds"];
  const cardId = Number(
    Array.isArray(ids) ? ids[ids.length - 1] : event.payload["cardId"],
  );
  const data = state.cards[cardId];
  const rank = event.payload["rank"];
  state.resolution.bindings[trigger.as] = {
    kind: "cards",
    cards: [
      {
        instanceId: String(event.payload["instanceId"]),
        cardId,
        rank: typeof rank === "number" ? rank : (data?.rank ?? null),
        counterPower:
          data?.type === "Battle" ? (data.counterOrThreat ?? 0) : null,
        threat: null,
      },
    ],
  };
}

/** Continues the paused resolution after a `target`, `zone` or `confirm` choice. */
export function resumeResolution(
  state: GameState,
  kind: "target" | "zone" | "confirm" | "replacementOrder",
  optionId: string,
): void {
  const r = state.resolution;
  if (!r) throw new Error("No resolution in progress");
  if (kind === "confirm") r.answer = optionId === "yes" ? "yes" : "no";
  else if (kind === "replacementOrder") r.replacementPicks.push(optionId);
  else if (kind === "zone") r.zonePicks.push(optionId);
  else r.chosen.push(optionId);
  runResolution(state);
}

/** The effect a path points at, in `list` and its nested `effects`. */
function effectAt(list: Effect[], path: number[]): Effect | undefined {
  let effects = list;
  let effect: Effect | undefined;
  for (const index of path) {
    effect = effects[index];
    if (!effect) return undefined;
    effects = "effects" in effect ? effect.effects : [];
  }
  return effect;
}

/** The next effect after `path`: into a search's own effects first, then the next sibling. */
function nextPath(list: Effect[], path: number[]): number[] | null {
  const current = effectAt(list, path);
  if (current && "effects" in current && current.effects.length > 0)
    return [...path, 0];
  const next = [...path];
  while (next.length > 0) {
    next[next.length - 1] = (next[next.length - 1] ?? 0) + 1;
    if (effectAt(list, next)) return next;
    next.pop();
  }
  return null;
}

function endResolution(state: GameState): void {
  state.resolution = null;
  // Revealed cards go back to their normal visibility when the effect ends (5.10.1.1).
  state.revealed = [];
}

function confirm(state: GameState, rule: string): "yes" | "no" | "paused" {
  const r = state.resolution as NonNullable<GameState["resolution"]>;
  if (r.answer !== null) {
    const answer = r.answer;
    r.answer = null;
    return answer;
  }
  requireChoice(state, r.standby.master, "confirm", rule, [
    { id: "yes", cardId: null, abilityId: r.standby.abilityId },
    { id: "no", cardId: null, abilityId: r.standby.abilityId },
  ]);
  return "paused";
}

function runResolution(state: GameState): void {
  const r = state.resolution;
  if (!r) return;
  const ability = findAbility(state, r.standby);
  const master = r.standby.master;
  const log = (type: string, rule: string) =>
    appendLog(state, type, master, { rule, abilityId: r.standby.abilityId });
  while (state.result === null) {
    if (r.stage === "useAbility") {
      const answer = confirm(state, "10.5.4");
      if (answer === "paused") return;
      if (answer === "no") {
        log("abilityDeclined", "10.5.4");
        break;
      }
      r.stage = ability.cost ? "payCost" : "main";
      continue;
    }
    if (r.stage === "payCost") {
      const cost = ability.cost;
      // A cost that can't be paid in full can't be chosen (10.5.4.1); the effects don't run.
      if (!cost || !canPay(contextOf(state), cost.effects)) {
        log("costNotPaid", "10.5.4.1");
        break;
      }
      if (cost.optional) {
        const answer = confirm(state, "10.5.4");
        if (answer === "paused") return;
        if (answer === "no") {
          log("costNotPaid", "10.5.4");
          break;
        }
      }
      r.stage = "cost";
      r.path = [0];
      continue;
    }
    const list =
      r.stage === "cost" ? (ability.cost?.effects ?? []) : ability.effects;
    const effect = effectAt(list, r.path);
    if (!effect) {
      if (r.stage === "cost") {
        r.stage = "main";
        r.path = [0];
        continue;
      }
      break;
    }
    // Gates are checked again before each effect: an Awakening gate can close mid-resolution (Q7).
    if (!gatesOpen(state, master, ability.gates)) {
      log("abilityInactive", "10.3.2");
      break;
    }
    if (perform(state, effect) === "paused") return;
    r.chosen = [];
    r.zonePicks = [];
    r.replacementPicks = [];
    r.subject = null;
    const next = nextPath(list, r.path);
    if (next) r.path = next;
    else if (r.stage === "cost") {
      r.stage = "main";
      r.path = [0];
    } else break;
  }
  endResolution(state);
}

/** Whether every cost effect can be performed in full (10.5.4.1). */
function canPay(ctx: Context, effects: Effect[]): boolean {
  return effects.every((effect) => {
    // Reducing your own rage as a cost needs that much rage (EBP01-020).
    if (effect.effect === "rage") {
      const delta = amountOf(ctx, effect.delta);
      return (
        delta >= 0 || players(ctx, effect.player).every((p) => p.rage >= -delta)
      );
    }
    if (effect.effect !== "discard") return true;
    const hand = select(ctx, discardFilter(effect));
    if (effect.count === "all" || effect.count === "anyNumber") return true;
    return (
      hand.length >=
      ("exact" in effect.count ? exactCount(ctx, effect.count) : 0)
    );
  });
}

type Outcome = "done" | "paused";

function bindCards(
  ctx: Context,
  name: string | undefined,
  cards: CardInstance[],
): void {
  if (!name) return;
  ctx.bindings[name] = {
    kind: "cards",
    cards: cards.map((card) => {
      const data = cardOf(ctx.state, card);
      return {
        instanceId: card.instanceId,
        cardId: card.cardId,
        rank: getRank(ctx.state, card),
        counterPower:
          data.type === "Battle" ? getCounterPower(ctx.state, card) : null,
        threat:
          data.type === "Monster" ? getThreat(ctx.state, card.owner) : null,
      };
    }),
  };
}

const playerOf = (ctx: Context, who: "you" | "opponent") =>
  who === "you"
    ? getPlayer(ctx.state, ctx.master)
    : getOpponent(ctx.state, ctx.master);

const located = (state: GameState, ids: string[]) =>
  ids.map((id) => locate(state, id)).filter((l): l is Located => !!l);

/**
 * Picks cards for an effect (10.5.3), one choice per card. Exactly N picks as many as possible,
 * with no choice when there are N or fewer (10.5.3.1), unless the area is hidden and the search
 * may find nothing (`mayFindNothing`, 5.8.1.2) or the chooser confirms every pick
 * (`confirmSingleTarget`, M5d, or `confirmSingleOption`, M5e); "up to N" adds a `done` option. Returns the picked cards, or
 * "paused" while a choice is pending.
 */
function pickCards(
  ctx: Context,
  candidates: Located[],
  count: Count,
  chooser: PlayerId,
  rule: string,
  options: { mayFindNothing?: boolean; hidden?: boolean } = {},
): Located[] | "paused" {
  const { state } = ctx;
  const r = state.resolution as NonNullable<GameState["resolution"]>;
  const chosen = located(
    state,
    r.chosen.filter((id) => id !== "done"),
  );
  const left = candidates.filter((l) => !r.chosen.includes(l.card.instanceId));
  if (count === "all") return candidates;
  if (count === "anyNumber")
    throw new Error("not implemented: count anyNumber");
  const limit = "exact" in count ? exactCount(ctx, count) : count.upTo;
  const remaining = limit - chosen.length;
  const canStop = "upTo" in count || options.mayFindNothing === true;
  const confirm = confirmsSingleOption(state, chooser, "target");
  if (!canStop && left.length <= remaining && !confirm)
    return [...chosen, ...left];
  if (remaining <= 0 || left.length === 0 || r.chosen.includes("done"))
    return chosen;
  // Hidden cards are offered in instance id order, so the options never reveal a deck's order.
  if (options.hidden)
    left.sort(
      (a, b) =>
        Number(a.card.instanceId.slice(1)) - Number(b.card.instanceId.slice(1)),
    );
  requireChoice(
    state,
    chooser,
    "target",
    rule,
    [
      ...left.map((l) => ({
        id: l.card.instanceId,
        cardId: l.card.cardId,
        abilityId: r.standby.abilityId,
      })),
      ...(canStop
        ? [{ id: "done", cardId: null, abilityId: r.standby.abilityId }]
        : []),
    ],
    options.hidden === true,
  );
  return "paused";
}

/** Takes a card out of a hand, deck, discard pile or monster deck. */
function takeCard(found: Located): CardInstance {
  const { player, area, card } = found;
  const list =
    area === "hand"
      ? player.hand
      : area === "deck"
        ? player.deck
        : area === "discard"
          ? player.discard
          : area === "monsterDeck"
            ? player.monsterDeck
            : null;
  if (!list) throw new Error(`not implemented: move a card from ${area}`);
  const index = list.findIndex((c) => c.instanceId === card.instanceId);
  if (index < 0) throw new Error(`Card ${card.instanceId} is not in ${area}`);
  list.splice(index, 1);
  return card;
}

function discardFilter(
  effect: Extract<Effect, { effect: "discard" }>,
): Selector {
  return (
    effect.filter ?? {
      owner: effect.player === "opponent" ? "opponent" : "you",
      area: "hand",
    }
  );
}

/** Discards cards from a hand to the discard pile (5.7.1). The discard pile is public. */
function discardCards(ctx: Context, cards: Located[], rule: string): void {
  const r = ctx.state.resolution as NonNullable<GameState["resolution"]>;
  for (const found of cards) {
    const card = toDiscard(ctx.state, takeCard(found));
    appendLog(ctx.state, "discard", found.player.id, {
      rule,
      cardId: card.cardId,
      // Its id in the discard pile (public), whose effect discarded it, and whether it paid a
      // cost (T3).
      instanceId: card.instanceId,
      by: ctx.master,
      ...(r.stage === "cost" ? { cost: true } : {}),
      abilityId: r.standby.abilityId,
    });
  }
}

/** Zones a card may be played to by an effect (5.11.1.1 to 5.11.1.3, Q3). */
function playZones(
  ctx: Context,
  effect: Extract<Effect, { effect: "play" }>,
  used: ZoneNumber[],
): ZoneNumber[] {
  const me = getPlayer(ctx.state, ctx.master);
  const refs = effect.zones
    ? resolveZoneSet(ctx, effect.zones, [me])
    : ZONE_NUMBERS.map((zone) => ({ player: me.id, zone }));
  let zones = [
    ...new Set(refs.filter((r) => r.player === me.id).map((r) => r.zone)),
  ]
    // Never the zone the player's own monster occupies (5.11.1.1, 5.11.1.2).
    .filter((zone) => zone !== me.monsterPosition)
    .sort((a, b) => a - b);
  // Cards played at the same time go to different zones if possible (5.11.1.3).
  const fresh = zones.filter((zone) => !used.includes(zone));
  if (fresh.length > 0) zones = fresh;
  // Empty zones first (Q3); occupied zones are allowed when no empty one is left (11.5).
  if (effect.preferEmpty) {
    const empty = zones.filter((zone) => me.zones[zone].length === 0);
    if (empty.length > 0) zones = empty;
  }
  return zones;
}

function perform(state: GameState, effect: Effect): Outcome {
  const ctx = contextOf(state);
  const r = state.resolution as NonNullable<GameState["resolution"]>;
  const abilityId = r.standby.abilityId;
  const chooserOf = (who: "you" | "opponent") => playerOf(ctx, who).id;
  switch (effect.effect) {
    case "destroy": {
      const { select: selector, count, chooser } = effect.target;
      const targets = pickCards(
        ctx,
        select(ctx, selector),
        count,
        chooserOf(chooser),
        "10.5.3",
      );
      if (targets === "paused") return "paused";
      bindCards(
        ctx,
        effect.as,
        targets.map((t) => t.card),
      );
      // A card with 2 or more replacements: its master picks the one that applies (10.9.2.1).
      const picks = new Map<string, string>();
      let pickIndex = 0;
      for (const target of targets) {
        const options = destroyReplacements(state, target.card);
        if (options.length < 2) continue;
        const picked = r.replacementPicks[pickIndex++];
        if (picked === undefined) {
          requireChoice(
            state,
            target.player.id,
            "replacementOrder",
            "10.9.2.1",
            options.map((o) => ({
              id: o.abilityId,
              cardId: o.source.cardId,
              abilityId: o.abilityId,
            })),
          );
          return "paused";
        }
        picks.set(target.card.instanceId, picked);
      }
      destroyCards(state, targets, "5.12", abilityId, picks, ctx.master);
      return "done";
    }
    case "discard": {
      const filter = discardFilter(effect);
      const owner = select(ctx, { ...filter, area: "hand" });
      const chooser = chooserOf(effect.chooser);
      const picked = pickCards(ctx, owner, effect.count, chooser, "5.7.1", {
        hidden: owner.every((l) => l.player.id === chooser),
      });
      if (picked === "paused") return "paused";
      // Bound before the cards move, so later effects read their last known information (10.10).
      bindCards(
        ctx,
        effect.as,
        picked.map((p) => p.card),
      );
      discardCards(ctx, picked, "5.7.1");
      return "done";
    }
    case "discardDownTo": {
      if (effect.player === "each")
        throw new Error("not implemented: discardDownTo each");
      const player = playerOf(ctx, effect.player);
      // A hand at or below the size: nothing happens (5.7.2.1).
      if (player.hand.length <= effect.size) {
        appendLog(state, "discardDownTo", player.id, {
          rule: "5.7.2.1",
          size: effect.size,
          discarded: 0,
          abilityId,
        });
        return "done";
      }
      // That player chooses which cards to discard, down to the size (5.7.2; Paul's ruling: the
      // player picks the discards, not the keeps). The result is the same as 5.7.2's wording.
      const hand = select(ctx, {
        owner: effect.player === "you" ? "you" : "opponent",
        area: "hand",
      });
      const rest = pickCards(
        ctx,
        hand,
        { exact: hand.length - effect.size },
        player.id,
        "5.7.2",
        { hidden: true },
      );
      if (rest === "paused") return "paused";
      appendLog(state, "discardDownTo", player.id, {
        rule: "5.7.2",
        size: effect.size,
        discarded: rest.length,
        abilityId,
      });
      discardCards(ctx, rest, "5.7.2");
      return "done";
    }
    case "search": {
      if (effect.player !== "you")
        throw new Error("not implemented: search another player's deck");
      const searcher = getPlayer(state, ctx.master);
      const candidates = select(ctx, { ...effect.filter, area: "deck" });
      // The searcher looks at the whole deck; with properties given, it may find nothing
      // (4.1.2.3, 5.8.1.2).
      const found = pickCards(
        ctx,
        candidates,
        effect.count,
        searcher.id,
        "5.8.1",
        { mayFindNothing: true, hidden: true },
      );
      if (found === "paused") return "paused";
      // What was searched for is public (the card's text), so the log names it (M5e search modal).
      appendLog(state, "search", searcher.id, {
        rule: "5.8.1",
        found: found.length,
        abilityId,
        filter: effect.filter,
        count: effect.count,
      });
      if (effect.reveal)
        for (const f of found) {
          state.revealed.push(f.card.instanceId);
          appendLog(state, "reveal", searcher.id, {
            rule: "5.10.1",
            cardId: f.card.cardId,
            abilityId,
          });
        }
      bindCards(
        ctx,
        effect.as,
        found.map((f) => f.card),
      );
      return "done";
    }
    case "play": {
      const me = getPlayer(state, ctx.master);
      const opponent = getOpponent(state, ctx.master);
      const filter: Selector = { ...effect.filter, area: effect.from };
      let candidates = select(ctx, filter);
      if (candidates.some((c) => cardOf(state, c.card).type !== "Battle"))
        throw new Error("not implemented: play a non-battle card");
      // 8.2.1 limits only the main phase action; effect plays ignore it unless the data says not.
      if (effect.ignoreRankLimit === false)
        candidates = candidates.filter((c) => {
          const rank = getRank(state, c.card);
          return rank !== null && rank <= (opponent.monsterPosition ?? 0);
        });
      const cards = pickCards(ctx, candidates, effect.count, me.id, "5.11.1", {
        hidden: effect.from === "deck" || effect.from === "hand",
      });
      if (cards === "paused") return "paused";
      // A zone for each card, in order (5.11.1.2, 5.11.1.3, Q3).
      const zones: (ZoneNumber | null)[] = [];
      for (const [i] of cards.entries()) {
        const picked = r.zonePicks[i];
        if (picked !== undefined) {
          zones.push(Number(picked.split(":")[1]) as ZoneNumber);
          continue;
        }
        const legal = playZones(
          ctx,
          effect,
          zones.filter((z): z is ZoneNumber => z !== null),
        );
        if (legal.length === 0) {
          zones.push(null);
          r.zonePicks.push("none");
        } else if (
          legal.length === 1 &&
          !confirmsSingleOption(state, me.id, "other")
        ) {
          zones.push(legal[0] as ZoneNumber);
          r.zonePicks.push(`${me.id}:${legal[0]}`);
        } else {
          requireChoice(
            state,
            me.id,
            "zone",
            "5.11.1",
            legal.map((zone) => ({
              id: `${me.id}:${zone}`,
              cardId: null,
              abilityId,
            })),
          );
          return "paused";
        }
      }
      const placed: CardInstance[] = [];
      cards.forEach((found, i) => {
        const zone = zones[i];
        if (zone === null || zone === undefined) return;
        const card = moved(state, takeCard(found));
        card.playedVia = "effect";
        me.zones[zone].push([card]);
        placed.push(card);
        // Played by an effect (5.11.1): [enter] triggers on this event.
        appendLog(state, "place", me.id, {
          rule: "5.11.1",
          cardId: card.cardId,
          instanceId: card.instanceId,
          from: found.area,
          to: `zone ${zone}`,
          played: true,
          abilityId,
        });
      });
      bindCards(ctx, effect.as, placed);
      return "done";
    }
    case "addToHand": {
      for (const found of select(ctx, effect.target)) {
        const wasPublic =
          found.area === "discard" ||
          state.revealed.includes(found.card.instanceId);
        const card = moved(state, takeCard(found));
        found.player.hand.push(card);
        appendLog(state, "addToHand", found.player.id, {
          rule: "4.9",
          from: found.area,
          // A card from a hidden area is named only if it was revealed (5.10).
          ...(wasPublic ? { cardId: card.cardId } : {}),
          abilityId,
        });
      }
      return "done";
    }
    case "shuffle": {
      for (const player of players(ctx, effect.player)) {
        shuffleInPlace(state, player.deck);
        appendLog(state, "shuffleDeck", player.id, {
          rule: "5.3.1",
          abilityId,
        });
      }
      return "done";
    }
    case "rage": {
      const delta = amountOf(ctx, effect.delta);
      for (const player of players(ctx, effect.player))
        setRage(state, player, player.rage + delta, "3.4.1", { abilityId });
      return "done";
    }
    case "draw": {
      const count = amountOf(ctx, effect.count);
      for (const player of players(ctx, effect.player)) {
        const drawn = drawCards(state, player, count);
        appendLog(state, "draw", player.id, {
          rule: "5.4.2",
          count: drawn,
          abilityId,
        });
      }
      return "done";
    }
    case "chooseZone": {
      const [choice] = r.zonePicks;
      if (choice === undefined) {
        const owner = playerOf(ctx, effect.owner);
        requireChoice(
          state,
          ctx.master,
          "zone",
          "10.5.2.2",
          ZONE_NUMBERS.map((zone) => ({
            id: `${owner.id}:${zone}`,
            cardId: null,
            abilityId,
          })),
        );
        return "paused";
      }
      const [player, zone] = choice.split(":");
      ctx.bindings[effect.as] = {
        kind: "zone",
        player: player as string,
        zone: Number(zone) as ZoneNumber,
      };
      appendLog(state, "chooseZone", ctx.master, {
        rule: "10.5.2.2",
        player,
        zone: Number(zone),
      });
      return "done";
    }
    case "evolve": {
      // 1. Pick the battle card to evolve: one with an Evolution keyword (5.17, Q8).
      if (r.subject === null) {
        const candidates = select(ctx, effect.target).filter(
          (l) => l.zone !== undefined && evolutionOf(state, l.card) !== null,
        );
        const picked = pickCards(
          ctx,
          candidates,
          { exact: 1 },
          ctx.master,
          "5.17",
        );
        if (picked === "paused") return "paused";
        const [target] = picked;
        // No legal card: nothing happens.
        if (!target) return "done";
        r.subject = target.card.instanceId;
        r.chosen = [];
      }
      const target = locate(state, r.subject);
      const evolution = target && evolutionOf(state, target.card);
      if (!target || target.zone === undefined || !evolution) return "done";
      // 2. Search the deck for 1 battle card with the trait and rank N or lower, which may find
      // nothing (12.6.2, 5.8.1.2).
      const me = getPlayer(state, ctx.master);
      const filter: Selector = {
        owner: "you",
        area: "deck",
        type: "Battle",
        traits: [evolution.trait],
        rank: { op: "<=", value: evolution.rank },
      };
      const found = pickCards(
        ctx,
        select(ctx, filter),
        { exact: 1 },
        me.id,
        "12.6.2",
        { mayFindNothing: true, hidden: true },
      );
      if (found === "paused") return "paused";
      appendLog(state, "search", me.id, {
        rule: "12.6.2",
        found: found.length,
        abilityId,
        filter,
        count: { exact: 1 },
      });
      const [card] = found;
      if (card) {
        // 3. Reveal it and play it stacked on top of the evolving card (12.6.2, 5.17.1).
        appendLog(state, "reveal", me.id, {
          rule: "5.10.1",
          cardId: card.card.cardId,
          abilityId,
        });
        const stack = me.zones[target.zone].find(
          (s) => topOf(s)?.instanceId === target.card.instanceId,
        );
        if (stack) {
          const evolved = moved(state, takeCard(card));
          evolved.playedVia = "evolution";
          stack.push(evolved);
          appendLog(state, "place", me.id, {
            rule: "12.6.2",
            cardId: evolved.cardId,
            instanceId: evolved.instanceId,
            from: "deck",
            to: `zone ${target.zone}`,
            played: true,
            abilityId,
          });
          appendLog(state, "evolve", me.id, {
            rule: "5.17.1.1",
            from: target.card.cardId,
            to: evolved.cardId,
            zone: target.zone,
            // Which card evolved, into which, and by which ability (M5g combos).
            fromInstanceId: target.card.instanceId,
            instanceId: evolved.instanceId,
            abilityId,
          });
        }
      }
      // 4. The deck is shuffled whether or not the search found a card.
      shuffleInPlace(state, me.deck);
      appendLog(state, "shuffleDeck", me.id, { rule: "12.6.2", abilityId });
      return "done";
    }
    case "putOnDeck": {
      for (const found of select(ctx, effect.target)) {
        const card = takeFromAnywhere(state, found);
        const owner = getPlayer(state, card.owner);
        const arrived = moved(state, card);
        if (effect.where === "top") owner.deck.unshift(arrived);
        else owner.deck.push(arrived);
        appendLog(state, "putOnDeck", owner.id, {
          rule: "5.2.1",
          cardId: arrived.cardId,
          from: found.area,
          where: effect.where,
          abilityId,
        });
      }
      return "done";
    }
    case "moveBattle": {
      const targets = select(ctx, effect.target).filter(
        (t) => t.zone !== undefined,
      );
      if (targets.length > 1)
        throw new Error("not implemented: moveBattle with several cards");
      const [target] = targets;
      if (!target || target.zone === undefined) return "done";
      const owner = target.player;
      // Never into the zone of the owner's own monster (Q5), and not where it already is.
      const destinations = [
        ...new Set(
          resolveZoneSet(ctx, effect.to, [owner])
            .filter((z) => z.player === owner.id)
            .map((z) => z.zone),
        ),
      ]
        .filter((z) => z !== owner.monsterPosition && z !== target.zone)
        .sort((a, b) => a - b);
      const [picked] = r.zonePicks;
      if (picked === undefined) {
        if (destinations.length === 0) return "done";
        if (
          destinations.length > 1 ||
          effect.optional ||
          confirmsSingleOption(state, owner.id, "other")
        ) {
          requireChoice(state, owner.id, "zone", "5.2.1", [
            ...destinations.map((zone) => ({
              id: `${owner.id}:${zone}`,
              cardId: null,
              abilityId,
            })),
            ...(effect.optional
              ? [{ id: "done", cardId: null, abilityId }]
              : []),
          ]);
          return "paused";
        }
      }
      if (picked === "done") return "done";
      const to = (
        picked === undefined ? destinations[0] : Number(picked.split(":")[1])
      ) as ZoneNumber;
      const from = target.zone;
      const stack = owner.zones[from].find(
        (s) => topOf(s)?.instanceId === target.card.instanceId,
      );
      if (!stack) return "done";
      owner.zones[from] = owner.zones[from].filter((s) => s !== stack);
      // Zone to zone: the card keeps its identity (4.1.4). An occupied destination is resolved by
      // 11.5 at the next check timing, which keeps the card that arrived last.
      owner.zones[to].push(stack);
      appendLog(state, "moveBattle", owner.id, {
        rule: "5.2.1",
        cardId: target.card.cardId,
        instanceId: target.card.instanceId,
        from,
        to,
        abilityId,
      });
      return "done";
    }
    case "until": {
      // Each ability becomes a timed trigger until the end of the turn (T8, 10.6.5).
      const number = cardOf(state, {
        cardId: r.standby.sourceCardId,
      } as CardInstance).deckCardNumber;
      for (const ability of effect.abilities) {
        state.timedTriggers.push({
          kind: "delayed",
          abilityId: dataAbilityId(number, ability.id),
          sourceInstanceId: r.standby.sourceInstanceId,
          sourceCardId: r.standby.sourceCardId,
          master: ctx.master,
          until: effect.duration,
        });
        appendLog(state, "delayedAbility", ctx.master, {
          rule: "10.6.5",
          cardId: r.standby.sourceCardId,
          abilityId: dataAbilityId(number, ability.id),
          until: effect.duration,
        });
      }
      return "done";
    }
    case "custom": {
      const run = customEffects.get(effect.handler);
      if (!run) throw new Error(`not implemented: custom ${effect.handler}`);
      run(state, ctx);
      return "done";
    }
    default:
      throw new Error(`not implemented: ${effect.effect}`);
  }
}

/**
 * Takes a card out of wherever it is. A card on top of a zone stack takes its stack out; the
 * cards under it go to the discard pile without being destroyed (5.12.1.1).
 */
function takeFromAnywhere(state: GameState, found: Located): CardInstance {
  const { player, zone, card } = found;
  if (found.area === "zones" && zone !== undefined) {
    const stack = player.zones[zone].find(
      (s) => topOf(s)?.instanceId === card.instanceId,
    );
    if (!stack)
      throw new Error(`Card ${card.instanceId} is not in zone ${zone}`);
    player.zones[zone] = player.zones[zone].filter((s) => s !== stack);
    for (const under of stack.slice(0, -1)) toDiscard(state, under);
    return card;
  }
  return takeCard(found);
}

// ---------------------------------------------------------------------------------------------
// Replacement effects (10.9)

type ReplacementAbility = Extract<Ability, { kind: "replacement" }>;

export interface Replacement {
  ability: ReplacementAbility;
  source: CardInstance;
  master: PlayerId;
  abilityId: string;
}

/**
 * Replacement abilities that would replace destroying `card` (10.9, Q1): every active card's
 * `replaces: destroyed` ability whose gates are open, whose condition holds and whose selector
 * picks the card. The card must still be where it is about to be destroyed.
 */
export function destroyReplacements(
  state: GameState,
  card: CardInstance,
): Replacement[] {
  const found: Replacement[] = [];
  for (const { card: source, master } of activeCards(state)) {
    const data = abilitiesOf(state, source);
    if (data.status === "manual") continue;
    for (const ability of data.abilities) {
      if (
        ability.kind !== "replacement" ||
        ability.replaces.event !== "destroyed"
      )
        continue;
      if (!gatesOpen(state, master, ability.gates)) continue;
      const ctx: Context = {
        state,
        master,
        sourceInstanceId: source.instanceId,
        bindings: {},
      };
      if (ability.condition && !conditionHolds(ctx, ability.condition))
        continue;
      if (
        !select(ctx, ability.replaces.what).some(
          (l) => l.card.instanceId === card.instanceId,
        )
      )
        continue;
      if (ability.optional)
        throw new Error("not implemented: optional replacement");
      found.push({
        ability,
        source,
        master,
        abilityId: dataAbilityId(data.deckCardNumber, ability.id),
      });
    }
  }
  return found;
}

/**
 * Performs a replacement instead of the event it replaces (10.9.1): the original event never
 * happens (10.9.1.1), so no `destroy` is logged. Its effects run at once, outside the check timing.
 */
export function applyReplacement(
  state: GameState,
  replacement: Replacement,
  affected: CardInstance,
  replaces: string,
  rule: string,
): void {
  appendLog(state, "replace", replacement.master, {
    rule: "10.9.1",
    abilityId: replacement.abilityId,
    cardId: affected.cardId,
    replaces,
    replacedRule: rule,
  });
  const saved = state.resolution;
  state.resolution = {
    standby: {
      standbyId: "replacement",
      abilityId: replacement.abilityId,
      sourceInstanceId: replacement.source.instanceId,
      sourceCardId: replacement.source.cardId,
      master: replacement.master,
      timestamp: 0,
      event: state.log[state.log.length - 1] as LogEntry,
    },
    stage: "main",
    path: [0],
    bindings: {},
    chosen: [],
    zonePicks: [],
    answer: null,
    replacementPicks: [],
    subject: null,
  };
  try {
    for (const effect of replacement.ability.instead)
      if (perform(state, effect) === "paused")
        throw new Error(
          "not implemented: a replacement effect that needs a choice",
        );
  } finally {
    state.resolution = saved;
  }
}

/**
 * The replacement that applies to destroying `card`, if any. With 2 or more, `picked` names it
 * (10.9.2.1); without a pick (rule actions can't pause) it throws, since no M4 card has two.
 * Each replacement applies to an event at most once (10.9.2.3): once one applies, the destroy is
 * gone, so no other can.
 */
/** Error message when a rule action meets 2 or more replacements (decision 150, M12). */
export const REPLACEMENT_ORDER_IN_RULE_ACTION =
  "not implemented: choosing between replacements in a rule action";

export function replacementFor(
  state: GameState,
  card: CardInstance,
  picked?: string,
): Replacement | null {
  const options = destroyReplacements(state, card);
  if (options.length === 0) return null;
  if (options.length === 1) return options[0] as Replacement;
  const chosen = options.find((o) => o.abilityId === picked);
  if (!chosen) throw new Error(REPLACEMENT_ORDER_IN_RULE_ACTION);
  return chosen;
}
