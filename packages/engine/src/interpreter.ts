import {
  getTokenCard,
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
  type ReplaceableEvent,
  type Selector,
  type Trigger,
  type ZoneSet,
} from "@gojisim/cards";
import { confirmsSingleOption, requireChoice } from "./choices";
import {
  behind,
  inFrontOf,
  isAdjacent,
  leftRightPosition,
  sameColumn,
  type ZoneRef,
} from "./geometry";
import { activeCards } from "./abilities";
import { counterMonster, moveBehind } from "./counter";
import {
  advanceMonster,
  advanceMonsterTo,
  retreatMonster,
  retreatMonsterTo,
} from "./movement";
import { cardOf, destroyCards, isBattle, topOf } from "./rules";
import { shuffleInPlace } from "./rng";
import {
  appendLog,
  drawCards,
  getOpponent,
  getPlayer,
  moved,
  isToken,
  newInstance,
  setRage,
  toDiscard,
} from "./state";
import { markLoss } from "./losses";
import {
  getCounterPower,
  getRank,
  getThreat,
  cannotDraw,
  hasFlag,
  playAllowed,
  playRankReduction,
} from "./stats";
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

/** A card's type for selectors: a token counts as a battle card (Q39, 9.1.4.1). */
function typeOf(data: { type: string }): string {
  return isBattle(data) ? "Battle" : data.type;
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
  if ("ranksOf" in set) {
    // C3: the zones numbered like the bound cards' ranks; a rank with no zone names none.
    const binding = ctx.bindings[set.ranksOf];
    const ranks = new Set(
      binding?.kind === "cards" ? binding.cards.map((c) => c.rank) : [],
    );
    return owners.flatMap((p) =>
      ZONE_NUMBERS.filter((zone) => ranks.has(zone)).map((zone) => ({
        player: p.id,
        zone,
      })),
    );
  }
  const anchor = anchorZone(ctx, set.of);
  if (anchor === null) return [];
  const refs: ZoneRef[] = [];
  if (set.relation === "adjacentTo")
    refs.push(...allZones(ctx.state).filter((r) => isAdjacent(anchor, r)));
  else if (set.relation === "sameColumnAs")
    refs.push(...allZones(ctx.state).filter((r) => sameColumn(anchor, r)));
  else if (set.relation === "sameNumberAs")
    // C3: the zone with the anchor's number, on each field (EBP02-008, EBP02-015).
    refs.push(...allZones(ctx.state).filter((r) => r.zone === anchor.zone));
  else if (set.relation === "horizontallyAdjacentTo")
    // C3: beside it in its row: adjacent (4.4.5.2) and at another left-right position (4.4.5.5).
    refs.push(
      ...allZones(ctx.state).filter(
        (r) =>
          r.player === anchor.player &&
          isAdjacent(anchor, r) &&
          leftRightPosition(r, r.player) !==
            leftRightPosition(anchor, anchor.player),
      ),
    );
  else if (set.relation === "atOrBefore")
    // C3: zones numbered at most the anchor's, on each field (4.4.5.3.1, EBP02-018).
    refs.push(...allZones(ctx.state).filter((r) => r.zone <= anchor.zone));
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

export function hasKeyword(
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
    // A token is a battle card (Q39, 9.1.4.1).
    if (selector.type && typeOf(data) !== selector.type) return false;
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
      if (!isBattle(data)) return false;
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
    // C4: "non-red" (EBP04-039).
    if (selector.notColors?.some((c) => data.colors.includes(c))) return false;
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
    if (selector.stackOf) {
      const top =
        selector.stackOf === "this"
          ? ctx.sourceInstanceId
          : topOf(getPlayer(state, ctx.master).invadingMonsterZone)?.instanceId;
      if (top === undefined || !inStackOf(state, card, top)) return false;
    }
    return true;
  });
}

/** Whether `card` is under the card `topId` in the same stack (E4, 3.2). */
function inStackOf(
  state: GameState,
  card: CardInstance,
  topId: string,
): boolean {
  for (const player of state.players) {
    const stacks = [
      ...ZONE_NUMBERS.flatMap((zone) => player.zones[zone]),
      player.invadingMonsterZone,
    ];
    const stack = stacks.find((s) => topOf(s)?.instanceId === topId);
    if (stack)
      return stack.slice(0, -1).some((c) => c.instanceId === card.instanceId);
  }
  return false;
}

/** Log entries of the current turn (C2: "this turn"), oldest first. */
function thisTurnLog(state: GameState): LogEntry[] {
  for (let i = state.log.length - 1; i >= 0; i--)
    if (state.log[i]?.type === "beginTurn") return state.log.slice(i);
  return state.log;
}

// ---------------------------------------------------------------------------------------------
// Conditions, amounts, gates

/**
 * Whether `player`'s rage can't be reduced by `by`'s effects now (M1, Q16: "this card's [rage]
 * cannot be reduced by your opponent's effects" protects its master's rage), logged as no change
 * (1.3.3).
 */
function rageProtected(
  state: GameState,
  player: PlayerState,
  by: PlayerId,
): boolean {
  const top = topOf(player.invadingMonsterZone);
  if (
    by === player.id ||
    !top ||
    !hasFlag(state, top, "rageCannotBeReducedByOpponent")
  )
    return false;
  appendLog(state, "rageProtected", player.id, { rule: "1.3.3", by });
  return true;
}

/**
 * Whether `player`'s monster can't be moved by `by`'s effects (M1, EBP04-076), logged as no
 * change (1.3.3). A counter still moves it (5.15.1.1).
 */
function moveProtected(
  state: GameState,
  player: PlayerState,
  by: PlayerId,
): boolean {
  const top = topOf(player.invadingMonsterZone);
  if (
    by === player.id ||
    !top ||
    !hasFlag(state, top, "cannotBeMovedByOpponent")
  )
    return false;
  appendLog(state, "moveProtected", player.id, { rule: "1.3.3", by });
  return true;
}

/**
 * How many cards a selector counts. Counting monster cards in a discard pile also counts a card
 * that says to treat it as one there (C5, Q34: EBP03-071), if it passes the other filters.
 */
export function countOf(ctx: Context, selector: Selector): number {
  const found = select(ctx, selector).length;
  if (selector.area !== "discard" || selector.type !== "Monster") return found;
  const extra = select(ctx, { ...selector, type: undefined }).filter((l) => {
    if (cardOf(ctx.state, l.card).type === "Monster") return false;
    const data = abilitiesOf(ctx.state, l.card);
    return (
      data.status !== "manual" &&
      data.abilities.some(
        (a) =>
          a.kind === "countsAs" && a.type === "Monster" && a.area === "discard",
      )
    );
  });
  return found + extra.length;
}

export function amountOf(ctx: Context, amount: Amount): number {
  if (typeof amount === "number") return amount;
  if ("per" in amount)
    // "For every 5": whole groups only (EBP04-086).
    return (
      Math.floor(countOf(ctx, amount.per) / (amount.every ?? 1)) * amount.times
    );
  if ("colorsAmong" in amount) {
    // C4: distinct colors among the cards, White included (EBP03-067).
    const colors = new Set(
      select(ctx, amount.colorsAmong).flatMap(
        (l) => cardOf(ctx.state, l.card).colors,
      ),
    );
    return colors.size * amount.times;
  }
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
  if ("invasionAdvancesThisTurn" in amount)
    // Zones the monster actually advanced through invasion this turn (5.13.3, C2).
    return thisTurnLog(ctx.state)
      .filter(
        (e) =>
          e.type === "invasionDone" &&
          e.player !== null &&
          isPlayer(amount.invasionAdvancesThisTurn, e.player, ctx.master),
      )
      .reduce((total, e) => total + Number(e.payload["advances"] ?? 0), 0);
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
      countOf(ctx, condition.count),
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
  if ("amount" in condition)
    return compare(
      amountOf(ctx, condition.amount),
      condition.op,
      condition.value,
    );
  if ("zoneNumber" in condition) {
    // C3: zone numbers compared across the two fields (4.4.3, EBP04-016).
    const subject = anchorZone(ctx, condition.zoneNumber);
    const other = anchorZone(ctx, condition.of);
    return (
      subject !== null &&
      other !== null &&
      compare(subject.zone, condition.op, other.zone)
    );
  }
  if ("thisTurn" in condition) {
    const whose = condition.whose ?? "you";
    return thisTurnLog(state).some((e) => {
      if (e.player === null) return false;
      if (condition.thisTurn === "invaded")
        return e.type === "invade" && isPlayer(whose, e.player, ctx.master);
      // An opponent's battle card destroyed (5.12, 11.3, 11.5), from `whose` point of view.
      if (e.type !== "destroy" || isPlayer(whose, e.player, ctx.master))
        return false;
      const ids = e.payload["cardIds"];
      const top = Array.isArray(ids) ? ids[ids.length - 1] : undefined;
      return isBattle(state.cards[String(top)]);
    });
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
      if (trigger.from && playedFrom(event) !== trigger.from) return false;
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
      if (trigger.from === "monster") {
        // Burst's discard (12.5.2): the card left the invading monster for the discard pile.
        if (event.type !== "burstDiscard" || event.payload["gone"] === true)
          return false;
        if (trigger.cause && trigger.cause !== "burst") return false;
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
      // Once per effect (EBP04-052): one effect's discards are logged one after another, each
      // followed by the standby entries it caused.
      if (trigger.oncePerEffect && fromHand) {
        let i = state.log.indexOf(event) - 1;
        while (state.log[i]?.type === "enterStandby") i--;
        const previous = state.log[i];
        if (
          previous?.type === "discard" &&
          previous.player === event.player &&
          previous.payload["by"] === event.payload["by"] &&
          previous.payload["abilityId"] === event.payload["abilityId"]
        )
          return false;
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
      if (trigger.cause) {
        // E15: the 7.5.2 advance, an invasion advance, or one by an effect.
        const cause =
          event.payload["rule"] === "7.5.2"
            ? "endPhase"
            : event.payload["invasion"] === true
              ? "invasion"
              : "effect";
        if (cause !== trigger.cause) return false;
      }
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
    case "revenge":
      // T2 (12.7.2): this card was destroyed from the field (an effect, or crush and destroy,
      // 11.3), not by overload (duplicate card processing, Q17), and is now in the discard pile.
      return (
        event.type === "destroy" &&
        event.payload["rule"] !== "11.5" &&
        event.payload["discardInstanceId"] === source.instanceId
      );
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

/** Where a played card came from (T7): a main phase play is from the hand (10.5.2). */
function playedFrom(event: LogEntry): string {
  if (event.type === "newInvadingMonster") return "monsterDeck";
  const from = String(event.payload["from"]);
  return from === "resolutionArea" ? "hand" : from;
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
  if (what.type && typeOf(data) !== what.type) return false;
  if (what.name && data.name !== what.name) return false;
  if (what.nameIncludes && !data.name.includes(what.nameIncludes)) return false;
  const traits = getCardTraits(data);
  if (what.traits && !what.traits.every((x) => traits.includes(x)))
    return false;
  if (what.anyTraits && !what.anyTraits.some((x) => traits.includes(x)))
    return false;
  if (what.colors && !what.colors.some((c) => data.colors.includes(c)))
    return false;
  if (what.notColors?.some((c) => data.colors.includes(c))) return false;
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
    // Read the raw data: Revenge is active in the discard pile once expanded (T2).
    data.abilities.some(
      (a) =>
        (a.kind === "triggered" && (a.activeIn?.includes(area) ?? false)) ||
        (area === "discard" &&
          a.kind === "keyword" &&
          a.keyword.name === "revenge"),
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
    // Revenge (12.7.2, T2): a trigger checked from the discard pile once the card is there.
    if (ability.kind === "keyword" && ability.keyword.name === "revenge") {
      const { effects, optional, condition, cost } = ability.keyword;
      return [
        {
          kind: "triggered",
          id: "revenge",
          trigger: { on: "revenge" },
          activeIn: ["discard"],
          ...(optional === undefined ? {} : { optional }),
          ...(condition === undefined ? {} : { condition }),
          ...(cost === undefined ? {} : { cost }),
          effects,
        },
      ];
    }
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

/**
 * A hand card's play rules (M2, 8.2.1, 8.3.1): how much its rank counts as reduced for the play,
 * and whether the play is forbidden. Read from its master's side, with the card as the source.
 */
export function playRuleOf(
  state: GameState,
  card: CardInstance,
  master: PlayerId,
): { reduction: number; forbidden: boolean } {
  const data = abilitiesOf(state, card);
  // Other cards can grant a reduction (M2, EBP02-039 Lake Ashi Monster).
  const result = {
    reduction: playRankReduction(state, card),
    forbidden: false,
  };
  if (data.status === "manual") return result;
  const ctx: Context = {
    state,
    master,
    sourceInstanceId: card.instanceId,
    bindings: {},
  };
  for (const ability of data.abilities) {
    // A play on top of a card has its own reduction (`onTopPlays`).
    if (ability.kind !== "playRule" || ability.onTopOf) continue;
    if (ability.forbidden && conditionHolds(ctx, ability.forbidden))
      result.forbidden = true;
    if (
      ability.rankReduction !== undefined &&
      gatesOpen(state, master, ability.gates) &&
      (!ability.condition || conditionHolds(ctx, ability.condition))
    )
      result.reduction += amountOf(ctx, ability.rankReduction);
  }
  return result;
}

/**
 * Zones where `card` may be played from the hand on top of the card there (M2, 3.2.5,
 * EBP03-051), with the rank reduction that play gets.
 */
export function onTopPlays(
  state: GameState,
  card: CardInstance,
  master: PlayerId,
): { zone: ZoneNumber; reduction: number }[] {
  const data = abilitiesOf(state, card);
  if (data.status === "manual") return [];
  const ctx: Context = {
    state,
    master,
    sourceInstanceId: card.instanceId,
    bindings: {},
  };
  const plays: { zone: ZoneNumber; reduction: number }[] = [];
  for (const ability of data.abilities) {
    if (ability.kind !== "playRule" || !ability.onTopOf) continue;
    if (!gatesOpen(state, master, ability.gates)) continue;
    if (ability.condition && !conditionHolds(ctx, ability.condition)) continue;
    const reduction =
      ability.rankReduction === undefined
        ? 0
        : amountOf(ctx, ability.rankReduction);
    for (const host of select(ctx, { ...ability.onTopOf, area: "zones" }))
      if (host.zone !== undefined && host.player.id === master)
        plays.push({ zone: host.zone, reduction });
  }
  return plays;
}

/** The zone a rank I monster starts in, if its data says (K3, 6.3.1.6, Q31). */
export function startZoneOf(
  state: GameState,
  card: CardInstance,
): ZoneNumber | null {
  for (const ability of abilitiesOf(state, card).abilities)
    if (ability.kind === "setup") return ability.startZone;
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
  const discarded = toDiscard(state, card as CardInstance);
  appendLog(state, "burstDiscard", player.id, {
    rule: "12.5.2",
    cardId: standby.sourceCardId,
    wasTop: index === player.invadingMonsterZone.length,
    // Its id in the discard pile, for "when this card is discarded by Burst" (T3).
    instanceId: discarded.instanceId,
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
  const r = state.resolution;
  if (
    !r ||
    !(
      ("as" in trigger && trigger.as) ||
      (trigger.on === "destroyed" && trigger.underAs)
    )
  )
    return;
  const name = ("as" in trigger && trigger.as) || "";
  const ctx = contextOf(state);
  // T7: the played card, where it landed.
  if (trigger.on === "cardPlayed") {
    const found = locate(state, String(event.payload["instanceId"]));
    bindCards(ctx, name, found ? [found.card] : []);
    return;
  }
  // T7: the card discarded for this invasion (8.6.1.1), the latest such discard before the
  // event; it may have left the discard pile since.
  if (trigger.on === "invading") {
    const discard = [...state.log]
      .slice(0, event.seq)
      .reverse()
      .find(
        (e) =>
          e.type === "discard" &&
          e.payload["rule"] === "8.6.1" &&
          e.player === r.standby.master,
      );
    const found =
      discard && locate(state, String(discard.payload["instanceId"]));
    bindCards(ctx, name, found ? [found.card] : []);
    return;
  }
  if (trigger.on !== "destroyed" && trigger.on !== "discarded") return;
  // The cards that were under the destroyed card, where they are now (EBP03-052).
  if (trigger.on === "destroyed" && trigger.underAs) {
    const under = event.payload["underDiscardIds"];
    bindCards(
      ctx,
      trigger.underAs,
      (Array.isArray(under) ? under : []).flatMap((id) => {
        const found = locate(state, String(id));
        return found ? [found.card] : [];
      }),
    );
  }
  const ids = event.payload["cardIds"];
  const cardId = Number(
    Array.isArray(ids) ? ids[ids.length - 1] : event.payload["cardId"],
  );
  const data = state.cards[cardId];
  const rank = event.payload["rank"];
  if (!name) return;
  r.bindings[name] = {
    kind: "cards",
    cards: [
      {
        instanceId: String(event.payload["instanceId"]),
        cardId,
        rank: typeof rank === "number" ? rank : (data?.rank ?? null),
        counterPower: isBattle(data) ? (data?.counterOrThreat ?? 0) : null,
        threat: null,
      },
    ],
  };
}

/** Continues the paused resolution after a `target`, `zone` or `confirm` choice. */
export function resumeResolution(
  state: GameState,
  kind: "target" | "zone" | "confirm" | "replacementOrder" | "option",
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

/** Which branch an `if` (0 then, 1 else) or a `chooseOne` (option index) took, by path. */
type Branches = Record<string, number>;

/**
 * The effects nested in `effect` at `path`: a search's own effects, or the branch an `if` or a
 * `chooseOne` took (none until it is decided).
 */
function childrenOf(
  effect: Effect,
  path: number[],
  branches: Branches,
): Effect[] {
  if (effect.effect === "search") return effect.effects;
  const branch = branches[path.join(".")];
  if (branch === undefined) return [];
  if (effect.effect === "if")
    return (branch === 0 ? effect.then : effect.else) ?? [];
  if (effect.effect === "chooseOne")
    return effect.options[branch]?.effects ?? [];
  return [];
}

/** The effect a path points at, in `list` and its nested effects. */
function effectAt(
  list: Effect[],
  path: number[],
  branches: Branches = {},
): Effect | undefined {
  let effects = list;
  let effect: Effect | undefined;
  for (const [depth, index] of path.entries()) {
    effect = effects[index];
    if (!effect) return undefined;
    effects = childrenOf(effect, path.slice(0, depth + 1), branches);
  }
  return effect;
}

/** The next effect after `path`: into its nested effects first, then the next sibling. */
function nextPath(
  list: Effect[],
  path: number[],
  branches: Branches = {},
): number[] | null {
  const current = effectAt(list, path, branches);
  if (current && childrenOf(current, path, branches).length > 0)
    return [...path, 0];
  const next = [...path];
  while (next.length > 0) {
    next[next.length - 1] = (next[next.length - 1] ?? 0) + 1;
    if (effectAt(list, next, branches)) return next;
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
    const effect = effectAt(list, r.path, r.branches);
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
    const next = nextPath(list, r.path, r.branches);
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
    // Placing a card under a card as a cost needs that card (EBP01-073).
    if (effect.effect === "placeUnder") {
      const count = effect.count ?? { exact: 1 };
      return (
        select(ctx, effect.under).length > 0 &&
        (typeof count === "object" && "exact" in count
          ? select(ctx, effect.target).length >= exactCount(ctx, count)
          : true)
      );
    }
    if (effect.effect !== "discard") return true;
    const hand = select(ctx, discardFilter(effect));
    if (
      effect.count === "all" ||
      effect.count === "anyNumber" ||
      effect.count === "hand"
    )
      return true;
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
        counterPower: isBattle(data) ? getCounterPower(ctx.state, card) : null,
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

/**
 * Destroy targets (10.5.3). With an order (X), each pick is from the extreme cards among those
 * left, so "one by one from the lowest zone" moves on to the next zone (EBP04-035). "Any number"
 * picks one at a time until Done, within `maxTotalRank` (EBP04-024).
 */
function pickDestroyTargets(
  ctx: Context,
  all: Located[],
  target: Extract<Effect, { effect: "destroy" }>["target"],
  extremes: (found: Located[]) => Located[],
  chooser: PlayerId,
): Located[] | "paused" {
  const { state } = ctx;
  const r = state.resolution as NonNullable<GameState["resolution"]>;
  const { count, order, maxTotalRank } = target;
  if (count === "anyNumber") {
    const chosen = located(
      state,
      r.chosen.filter((id) => id !== "done"),
    );
    const used = chosen.reduce((t, l) => t + (getRank(state, l.card) ?? 0), 0);
    const left = all.filter(
      (l) =>
        !r.chosen.includes(l.card.instanceId) &&
        (maxTotalRank === undefined ||
          used + (getRank(state, l.card) ?? 0) <= maxTotalRank),
    );
    if (r.chosen.includes("done") || left.length === 0) return chosen;
    return pickCards(
      ctx,
      [...chosen, ...left],
      { upTo: chosen.length + 1 },
      chooser,
      "10.5.3",
    );
  }
  if (!order || count === "all")
    return pickCards(ctx, extremes(all), count, chooser, "10.5.3");
  for (;;) {
    const chosen = located(
      state,
      r.chosen.filter((id) => id !== "done"),
    );
    const rest = all.filter((l) => !r.chosen.includes(l.card.instanceId));
    const picked = pickCards(
      ctx,
      [...chosen, ...extremes(rest)],
      count,
      chooser,
      "10.5.3",
    );
    if (picked === "paused") return "paused";
    const added = picked.filter((l) => !r.chosen.includes(l.card.instanceId));
    if (added.length === 0) return picked;
    r.chosen.push(...added.map((l) => l.card.instanceId));
  }
}

/** Takes a card out of a hand, deck, discard pile or monster deck. */
function takeCard(found: Located): CardInstance {
  const { player, area, card } = found;
  // A strategy card leaves its strategy zone (E21: placed under a card instead of discarded).
  if (area === "strategy") {
    const index = player.strategyZones.findIndex((z) =>
      z.some((p) => p.card.instanceId === card.instanceId),
    );
    if (index < 0)
      throw new Error(`Card ${card.instanceId} is not in a strategy zone`);
    player.strategyZones[index] =
      player.strategyZones[index]?.filter(
        (p) => p.card.instanceId !== card.instanceId,
      ) ?? [];
    return card;
  }
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
function discardCards(
  ctx: Context,
  cards: Located[],
  rule: string,
): CardInstance[] {
  const r = ctx.state.resolution as NonNullable<GameState["resolution"]>;
  const discarded: CardInstance[] = [];
  for (const found of cards) {
    const card = toDiscard(ctx.state, takeCard(found));
    discarded.push(card);
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
  return discarded;
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
      const { select: selector, chooser, order } = effect.target;
      // X: only the extreme cards; the chooser picks among ties (Q33).
      const extremes = (found: Located[]): Located[] => {
        if (!order || found.length === 0) return found;
        const score = (l: Located): number =>
          order === "lowestRank"
            ? (getRank(state, l.card) ?? Infinity)
            : l.zone === undefined
              ? Infinity
              : order === "lowestZone"
                ? l.zone
                : (order === "leftmost" ? 1 : -1) *
                  leftRightPosition(
                    { player: l.player.id, zone: l.zone },
                    ctx.master,
                  );
        const best = Math.min(...found.map(score));
        return found.filter((l) => score(l) === best);
      };
      // A card the opponent's effects can't destroy can still be chosen; the destroy does
      // nothing to it (Q35, Paul's provisional ruling; 1.3.3).
      const targets = pickDestroyTargets(
        ctx,
        select(ctx, selector),
        effect.target,
        extremes,
        chooserOf(chooser),
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
      // E11: "discard your hand" is every card the filter picks.
      const count = effect.count === "hand" ? "all" : effect.count;
      const picked = pickCards(ctx, owner, count, chooser, "5.7.1", {
        hidden: owner.every((l) => l.player.id === chooser),
      });
      if (picked === "paused") return "paused";
      // Bound before the cards move, so later effects read their last known information (10.10).
      bindCards(
        ctx,
        effect.as,
        picked.map((p) => p.card),
      );
      // Bound in the discard pile (public): "for each card discarded this way" (EBP03-032).
      bindCards(ctx, effect.as, discardCards(ctx, picked, "5.7.1"));
      return "done";
    }
    case "discardDownTo": {
      // E11, "each player": the master first, then the opponent. A player already at the size
      // is skipped, so the effect resumes where it paused.
      if (effect.player === "each") {
        if (effect.optional)
          throw new Error("not implemented: optional discardDownTo each");
        const discarded: CardInstance[] = [];
        for (const who of ["you", "opponent"] as const) {
          const player = playerOf(ctx, who);
          if (player.hand.length <= effect.size) continue;
          const hand = select(ctx, { owner: who, area: "hand" });
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
          discarded.push(...discardCards(ctx, rest, "5.7.2"));
          r.chosen = [];
        }
        bindCards(ctx, effect.as, discarded);
        return "done";
      }
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
      // E11, "may discard ... until": that player is asked first (EBP02-070).
      if (effect.optional && r.subject === null) {
        if (r.answer === null) {
          requireChoice(state, player.id, "confirm", "5.7.2", [
            { id: "yes", cardId: null, abilityId },
            { id: "no", cardId: null, abilityId },
          ]);
          return "paused";
        }
        const answer = r.answer;
        r.answer = null;
        if (answer === "no") {
          bindCards(ctx, effect.as, []);
          return "done";
        }
        r.subject = "discardDownTo";
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
      // Bound in the discard pile (public), for "if they discard at least 1".
      bindCards(ctx, effect.as, discardCards(ctx, rest, "5.7.2"));
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
      // E18: played on top of a card in a zone, stacked on it (3.2.5). With that card gone,
      // nothing is played.
      if (effect.onTop) {
        const [host] = select(ctx, effect.onTop).filter(
          (l) => l.zone !== undefined,
        );
        const [found] = cards;
        const stack =
          host?.zone !== undefined
            ? host.player.zones[host.zone].find(
                (st) => topOf(st)?.instanceId === host.card.instanceId,
              )
            : undefined;
        if (!found || !host || host.zone === undefined || !stack) {
          bindCards(ctx, effect.as, []);
          return "done";
        }
        const card = moved(state, takeCard(found));
        card.playedVia = "effect";
        stack.push(card);
        appendLog(state, "place", me.id, {
          rule: "5.11.1",
          cardId: card.cardId,
          instanceId: card.instanceId,
          from: found.area,
          to: `zone ${host.zone}`,
          onTopOf: host.card.cardId,
          played: true,
          abilityId,
        });
        bindCards(ctx, effect.as, [card]);
        return "done";
      }
      // A zone for each card, in order (5.11.1.2, 5.11.1.3, Q3).
      const zones: (ZoneNumber | null)[] = [];
      for (const [i] of cards.entries()) {
        const picked = r.zonePicks[i];
        if (picked !== undefined) {
          zones.push(Number(picked.split(":")[1]) as ZoneNumber);
          continue;
        }
        const used = zones.filter((z): z is ZoneNumber => z !== null);
        let legal = playZones(ctx, effect, used);
        // One card per zone: no unused zone left, no more cards (EBP02-028).
        if (effect.onePerZone) legal = legal.filter((z) => !used.includes(z));
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
      // "Up to 1" and the like: the effect's player picks (E5).
      const picked = effect.count
        ? pickCards(
            ctx,
            select(ctx, effect.target),
            effect.count,
            ctx.master,
            "4.9",
          )
        : select(ctx, effect.target);
      if (picked === "paused") return "paused";
      for (const found of picked) {
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
      // "By 1 for each X" is one change of 1 per X (Q38): each fires its own rageChanged event,
      // so "whenever your rage is increased" triggers once per X.
      const step =
        typeof effect.delta === "object" && "times" in effect.delta
          ? effect.delta.times
          : delta;
      const changes = step === 0 ? 0 : Math.max(0, Math.round(delta / step));
      for (const player of players(ctx, effect.player)) {
        if (step < 0 && rageProtected(state, player, ctx.master)) continue;
        for (let i = 0; i < changes; i++)
          setRage(state, player, player.rage + step, "3.4.1", { abilityId });
      }
      return "done";
    }
    case "draw": {
      const count = amountOf(ctx, effect.count);
      for (const player of players(ctx, effect.player)) {
        // M1: a player who can't draw now draws nothing (EBP04-030, 1.3.3).
        if (count > 0 && cannotDraw(state, player)) {
          appendLog(state, "noDraw", player.id, { rule: "1.3.3", abilityId });
          continue;
        }
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
        // C3: only the zones of the owner's field the set names (EBP03-009).
        const offered = effect.zones
          ? ZONE_NUMBERS.filter((zone) =>
              hasZone(
                resolveZoneSet(ctx, effect.zones as ZoneSet, [owner]),
                owner.id,
                zone,
              ),
            )
          : ZONE_NUMBERS;
        // No zone to choose: the effects after it find nothing there.
        if (offered.length === 0) return "done";
        requireChoice(
          state,
          ctx.master,
          "zone",
          "10.5.2.2",
          offered.map((zone) => ({
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
      // "Evolve all of your ...": each card in turn, in zone order (E18).
      if (effect.count === "all") {
        r.queue ??= select(ctx, effect.target)
          .filter(
            (l) => l.zone !== undefined && evolutionOf(state, l.card) !== null,
          )
          .map((l) => l.card.instanceId);
        for (;;) {
          if (r.subject === null) {
            const next = r.queue.shift();
            if (next === undefined) {
              delete r.queue;
              return "done";
            }
            r.subject = next;
            r.chosen = [];
          }
          if (evolveSubject(state, ctx, abilityId) === "paused")
            return "paused";
          r.subject = null;
          r.chosen = [];
        }
      }
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
      return evolveSubject(state, ctx, abilityId);
    }
    case "putOnDeck": {
      // E5: with a count, the effect's player picks ("up to 1", EBP03-055).
      const targets = effect.count
        ? pickCards(
            ctx,
            select(ctx, effect.target),
            effect.count,
            ctx.master,
            "5.2.1",
          )
        : select(ctx, effect.target);
      if (targets === "paused") return "paused";
      for (const found of targets) {
        const card = takeFromAnywhere(state, found);
        const owner = getPlayer(state, card.owner);
        // A token can't be in a deck: it disappears (9.1.4.2).
        if (isToken(state, card)) {
          appendLog(state, "tokenGone", owner.id, {
            rule: "9.1.4.2",
            cardId: card.cardId,
          });
          continue;
        }
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
      // Several cards: the effect's player picks the one to move first (E10); with `optional`
      // they may pick none.
      if (targets.length > 1 && r.subject === null) {
        const picked = pickCards(
          ctx,
          targets,
          effect.optional ? { upTo: 1 } : { exact: 1 },
          ctx.master,
          "5.2.1",
        );
        if (picked === "paused") return "paused";
        const [card] = picked;
        if (!card) return "done";
        r.subject = card.card.instanceId;
      }
      const target =
        targets.length > 1
          ? targets.find((t) => t.card.instanceId === r.subject)
          : targets[0];
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
          confirmsSingleOption(state, ctx.master, "other")
        ) {
          // The effect's player picks, also for the opponent's card (EBP02-057).
          requireChoice(state, ctx.master, "zone", "5.2.1", [
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
    case "if": {
      // C1: the branch is decided once, when the resolution reaches it.
      r.branches = {
        ...r.branches,
        [r.path.join(".")]: conditionHolds(ctx, effect.condition) ? 0 : 1,
      };
      return "done";
    }
    case "chooseOne": {
      // E7 (10.5.2.2.1): only options whose gates are open and condition holds can be chosen.
      const open = effect.options
        .map((option, index) => ({ option, index }))
        .filter(
          ({ option }) =>
            gatesOpen(state, ctx.master, option.gates) &&
            (!option.condition || conditionHolds(ctx, option.condition)),
        );
      const [picked] = r.chosen;
      let branch: number | undefined =
        picked === undefined ? undefined : Number(picked);
      if (branch === undefined) {
        if (open.length === 0) return "done";
        if (
          open.length === 1 &&
          !confirmsSingleOption(state, ctx.master, "other")
        )
          branch = open[0]?.index;
        else {
          requireChoice(
            state,
            ctx.master,
            "option",
            "10.5.2.2.1",
            open.map(({ index }) => ({
              id: String(index),
              cardId: null,
              abilityId,
            })),
          );
          return "paused";
        }
      }
      r.branches = { ...r.branches, [r.path.join(".")]: branch as number };
      appendLog(state, "chooseOption", ctx.master, {
        rule: "10.5.2.2.1",
        option: branch,
        abilityId,
      });
      return "done";
    }
    case "advance":
    case "retreat": {
      // E1 (5.13.1, 5.13.2): "by" zones one at a time, or "to" a zone (5.13.1.2, 5.13.2.2).
      for (const player of players(ctx, effect.player)) {
        const top = topOf(player.invadingMonsterZone);
        if (
          effect.filter &&
          !select(ctx, effect.filter).some(
            (l) => l.card.instanceId === top?.instanceId,
          )
        )
          continue;
        if (moveProtected(state, player, ctx.master)) continue;
        // "By" can be an amount ("1 additional zone for each Crystals", E15).
        const by = effect.by === undefined ? 1 : amountOf(ctx, effect.by);
        if (effect.effect === "advance") {
          const options = { invasion: false, rule: "5.13.1" };
          if (effect.toZone !== undefined)
            advanceMonsterTo(state, player, effect.toZone, options);
          else
            for (let i = 0; i < by; i++) advanceMonster(state, player, options);
        } else if (effect.toZone !== undefined)
          retreatMonsterTo(state, player, effect.toZone, "5.13.2");
        else
          for (let i = 0; i < by; i++) retreatMonster(state, player, "5.13.2");
      }
      return "done";
    }
    case "mill": {
      // E2 (5.7.3): the top cards go to the discard pile, which is public; an empty deck has
      // nothing to send.
      const sent: CardInstance[] = [];
      for (const player of players(ctx, effect.player)) {
        const cards = player.deck.splice(0, effect.count);
        const discarded = cards.map((card) => toDiscard(state, card));
        sent.push(...discarded);
        appendLog(state, "mill", player.id, {
          rule: "5.7.3",
          cardIds: discarded.map((c) => c.cardId),
          abilityId,
        });
      }
      bindCards(ctx, effect.as, sent);
      return "done";
    }
    case "lookTop": {
      // E3 (5.5): the player looks at the top cards, puts any number back on top in any order
      // (the first picked on top), and sends the rest to the discard pile.
      const me = getPlayer(state, ctx.master);
      const top = me.deck.slice(0, effect.count).map((card) => ({
        card,
        player: me,
        area: "deck" as const,
      }));
      const kept = pickCards(ctx, top, { upTo: top.length }, me.id, "5.5", {
        hidden: true,
      });
      if (kept === "paused") return "paused";
      const keptIds = kept.map((k) => k.card.instanceId);
      const rest = top.filter((l) => !keptIds.includes(l.card.instanceId));
      me.deck = [...kept.map((k) => k.card), ...me.deck.slice(top.length)];
      const discarded = rest.map((l) => toDiscard(state, l.card));
      appendLog(state, "lookTop", me.id, {
        rule: "5.5",
        count: top.length,
        kept: kept.length,
        abilityId,
      });
      if (discarded.length > 0)
        appendLog(state, "mill", me.id, {
          rule: "5.5",
          cardIds: discarded.map((c) => c.cardId),
          abilityId,
        });
      return "done";
    }
    case "placeUnder": {
      // E4 (3.2): cards go under a card on the field; they have no abilities there (3.2.3.1).
      // With several cards it could go under, the effect's player picks one first.
      if (r.subject === null) {
        const hosts = select(ctx, effect.under).filter(
          (l) => l.zone !== undefined || l.area === "monster",
        );
        const picked = pickCards(ctx, hosts, { exact: 1 }, ctx.master, "3.2");
        if (picked === "paused") return "paused";
        const [host] = picked;
        if (!host) return "done";
        r.subject = host.card.instanceId;
        r.chosen = [];
      }
      const under = locate(state, r.subject);
      if (!under) return "done";
      if (effect.hostAs) bindCards(ctx, effect.hostAs, [under.card]);
      const candidates = select(ctx, effect.target).filter(
        (l) => l.card.instanceId !== under.card.instanceId,
      );
      const picked = pickCards(
        ctx,
        candidates,
        effect.count ?? { exact: 1 },
        ctx.master,
        "3.2",
        {
          hidden: candidates.some(
            (c) => c.area === "hand" || c.area === "deck",
          ),
        },
      );
      if (picked === "paused") return "paused";
      const stackOf = (l: Located) =>
        l.area === "monster"
          ? l.player.invadingMonsterZone
          : l.zone !== undefined
            ? l.player.zones[l.zone].find(
                (st) => topOf(st)?.instanceId === l.card.instanceId,
              )
            : undefined;
      if (!stackOf(under)) return "done";
      const placed: CardInstance[] = [];
      for (const found of picked) {
        const wasPublic = found.area === "discard" || found.area === "zones";
        let taken: CardInstance;
        if (found.area === "zones" && found.zone !== undefined) {
          // A card on the field goes under alone (EBP03-042, EBP03-043); its stack stays.
          const from = stackOf(found);
          if (!from) continue;
          from.pop();
          const zone = found.zone;
          if (from.length === 0)
            found.player.zones[zone] = found.player.zones[zone].filter(
              (st) => st !== from,
            );
          taken = found.card;
        } else taken = takeCard(found);
        const card = moved(state, taken);
        // Read after the move, so the host's stack is current.
        const stack = stackOf(under) as CardInstance[];
        stack.splice(stack.length - 1, 0, card);
        placed.push(card);
        appendLog(state, "placeUnder", ctx.master, {
          rule: "3.2",
          from: found.area,
          ...(wasPublic ? { cardId: card.cardId } : {}),
          under: under.card.cardId,
          abilityId,
        });
      }
      bindCards(ctx, effect.as, placed);
      return "done";
    }
    case "returnDiscardToDeck": {
      // E5: the whole discard pile into the deck, then shuffle (5.3).
      for (const player of players(ctx, effect.player)) {
        const count = player.discard.length;
        player.deck.push(...player.discard.map((card) => moved(state, card)));
        player.discard = [];
        shuffleInPlace(state, player.deck);
        appendLog(state, "returnDiscardToDeck", player.id, {
          rule: "5.3.1",
          count,
          abilityId,
        });
      }
      return "done";
    }
    case "swap": {
      // E9 (5.6): two battle cards in that player's zones trade places at once; zone to zone,
      // they keep their identity (4.1.4). Fewer than 2 picked: nothing happens (5.6.2).
      const owner = playerOf(ctx, effect.owner);
      const candidates = select(ctx, {
        owner: effect.owner,
        area: "zones",
        type: "Battle",
      });
      const picked = pickCards(
        ctx,
        candidates,
        effect.optional ? { upTo: 2 } : { exact: 2 },
        ctx.master,
        "5.6",
      );
      if (picked === "paused") return "paused";
      const [a, b] = picked;
      if (!a || !b || a.zone === undefined || b.zone === undefined)
        return "done";
      const stackOf = (l: Located) =>
        owner.zones[l.zone as ZoneNumber].find(
          (s) => topOf(s)?.instanceId === l.card.instanceId,
        );
      const stackA = stackOf(a);
      const stackB = stackOf(b);
      if (!stackA || !stackB) return "done";
      owner.zones[a.zone] = owner.zones[a.zone].filter((s) => s !== stackA);
      owner.zones[b.zone] = owner.zones[b.zone].filter((s) => s !== stackB);
      owner.zones[b.zone].push(stackA);
      owner.zones[a.zone].push(stackB);
      appendLog(state, "swap", owner.id, {
        rule: "5.6.1",
        cardIds: [a.card.cardId, b.card.cardId],
        zones: [a.zone, b.zone],
        abilityId,
      });
      return "done";
    }
    case "moveAsCountered": {
      // E13 (Q14): only the move of 5.15.1.1; it is not a counter and fires no countered event.
      const player = playerOf(ctx, effect.player);
      if (!moveProtected(state, player, ctx.master))
        moveBehind(state, player, true);
      return "done";
    }
    case "activate": {
      // E17 (5.9): put a strategy card into an empty strategy zone and activate it, whatever its
      // rank; its placement text triggers as for an 8.3 activation.
      const me = getPlayer(state, ctx.master);
      const candidates = select(ctx, { ...effect.filter, area: effect.from });
      const picked = pickCards(ctx, candidates, effect.count, me.id, "5.9", {
        hidden: effect.from !== "discard",
      });
      if (picked === "paused") return "paused";
      for (const found of picked) {
        const index = me.strategyZones.findIndex((z) => z.length === 0);
        if (index < 0) break;
        // "Cannot play strategy cards" stops effects that put them into play too (Q32).
        if (!playAllowed(state, me, found.card)) continue;
        const card = moved(state, takeCard(found));
        me.strategyZones[index]?.push({ card, placedOnTurn: state.turn });
        appendLog(state, "place", me.id, {
          rule: "5.9",
          cardId: card.cardId,
          instanceId: card.instanceId,
          from: found.area,
          to: `strategy zone ${index + 1}`,
          played: true,
          abilityId,
        });
      }
      return "done";
    }
    case "revealTop": {
      // E3 (5.10): reveal the top cards; the matching ones the effect takes go to the hand, the
      // rest to the discard pile. Several takes are picked in order, each from the cards left.
      const me = getPlayer(state, ctx.master);
      const count = Math.max(0, amountOf(ctx, effect.count));
      // Fixed once revealed, so a "for each" count can't change between choices.
      if (r.subject === null) {
        r.queue = me.deck.slice(0, count).map((c) => c.instanceId);
        for (const card of me.deck.slice(0, count)) {
          state.revealed.push(card.instanceId);
          appendLog(state, "reveal", me.id, {
            rule: "5.10.1",
            cardId: card.cardId,
            abilityId,
          });
        }
        r.subject = "revealed";
        r.takes = [];
      }
      const ids = r.queue ?? [];
      const top = me.deck.filter((c) => ids.includes(c.instanceId));
      const takes = Array.isArray(effect.take) ? effect.take : [effect.take];
      const done = r.takes ?? [];
      for (let i = done.length; i < takes.length; i++) {
        const take = takes[i] as (typeof takes)[number];
        const already = done.flat();
        const candidates = select(ctx, { ...take.filter, area: "deck" }).filter(
          (l) =>
            ids.includes(l.card.instanceId) &&
            !already.includes(l.card.instanceId),
        );
        const taken = pickCards(ctx, candidates, take.count, me.id, "5.10");
        if (taken === "paused") return "paused";
        done.push(taken.map((l) => l.card.instanceId));
        r.takes = done;
        r.chosen = [];
      }
      const takenIds = done.flat();
      delete r.queue;
      delete r.takes;
      const taken = top.filter((c) => takenIds.includes(c.instanceId));
      me.deck = me.deck.filter(
        (c) =>
          !ids.includes(c.instanceId) ||
          (effect.keep === true && takenIds.includes(c.instanceId)),
      );
      // Kept: they stay on the deck, revealed, for the next effect (EBP04-079 plays them).
      if (effect.keep) bindCards(ctx, effect.as, taken);
      else {
        const added = taken.map((card) => moved(state, card));
        me.hand.push(...added);
        for (const card of added)
          appendLog(state, "addToHand", me.id, {
            rule: "4.9",
            from: "deck",
            cardId: card.cardId,
            abilityId,
          });
        // Revealed, so later effects may name them (EBP04-077: "if you added ...").
        bindCards(ctx, effect.as, added);
      }
      const rest = top
        .filter((c) => !takenIds.includes(c.instanceId))
        .map((card) => toDiscard(state, card));
      if (rest.length > 0)
        appendLog(state, "mill", me.id, {
          rule: "5.10",
          cardIds: rest.map((c) => c.cardId),
          abilityId,
        });
      return "done";
    }
    case "grant": {
      // E19: a flag for the rest of the turn on the cards the target picks now; it ends at 7.5.6.
      const { modifier } = effect;
      if (!("flag" in modifier) || !("target" in modifier))
        throw new Error("not implemented: grant without a target");
      const timestamp = state.nextTimestamp++;
      const flags = select(ctx, modifier.target).map((l) => ({
        instanceId: l.card.instanceId,
        modifier,
      }));
      state.continuousEffects.push({
        effectId: `grant:${abilityId}:${timestamp}`,
        timestamp,
        duration: "untilEndOfTurn",
        flags,
      });
      appendLog(state, "grant", ctx.master, {
        rule: "10.8.2",
        flag: modifier.flag,
        cardIds: flags.map((f) => locate(state, f.instanceId)?.card.cardId),
        abilityId,
      });
      return "done";
    }
    case "sendToDiscard": {
      // Cards a search found go to their owner's discard pile (public), not a discard (5.7).
      const sent = select(ctx, effect.target).map((l) =>
        toDiscard(state, takeCard(l)),
      );
      if (sent.length > 0)
        appendLog(state, "mill", ctx.master, {
          rule: "4.9",
          cardIds: sent.map((c) => c.cardId),
          abilityId,
        });
      bindCards(ctx, effect.as, sent);
      return "done";
    }
    case "boost": {
      // E19 (10.8.2): fixed when it resolves, for the cards the target picks now; "double" adds
      // each card's current value. It ends at 7.5.6.
      const bonuses = select(ctx, effect.target).map((l) => ({
        instanceId: l.card.instanceId,
        stat: effect.stat,
        amount:
          effect.amount === "double"
            ? effect.stat === "counterPower"
              ? getCounterPower(state, l.card)
              : effect.stat === "rank"
                ? (getRank(state, l.card) ?? 0)
                : getThreat(state, l.player.id)
            : amountOf(ctx, effect.amount),
      }));
      const timestamp = state.nextTimestamp++;
      state.continuousEffects.push({
        effectId: `boost:${abilityId}:${timestamp}`,
        timestamp,
        duration: "untilEndOfTurn",
        bonuses,
      });
      appendLog(state, "boost", ctx.master, {
        rule: "10.8.2",
        stat: effect.stat,
        cardIds: bonuses.map((b) => locate(state, b.instanceId)?.card.cardId),
        abilityId,
      });
      return "done";
    }
    case "counter": {
      // E12 (5.15.1, Q24): a real counter, so countered triggers fire and a missing next monster
      // loses the game (5.15.1.2.1). Picking the next monster ends this resolution: counter is
      // the last effect of every card that has it.
      counterMonster(state, playerOf(ctx, effect.player));
      if (state.pendingChoice !== null) {
        endResolution(state);
        return "paused";
      }
      return "done";
    }
    case "createToken": {
      // E6 (9.1.2, 5.11.4): a token appears in a zone of the effect's master, who owns it
      // (9.1.2.1). Zones as for an effect play: not the monster's, empty first (Q3, Q5).
      const me = getPlayer(state, ctx.master);
      const token = getTokenCard(effect.name);
      const refs = effect.zones
        ? resolveZoneSet(ctx, effect.zones, [me])
        : ZONE_NUMBERS.map((zone) => ({ player: me.id, zone }));
      const allowed = [
        ...new Set(refs.filter((r) => r.player === me.id).map((r) => r.zone)),
      ]
        .filter((zone) => zone !== me.monsterPosition)
        .sort((a, b) => a - b);
      const count = effect.count ?? 1;
      const zones: ZoneNumber[] = [];
      if (count === "each") zones.push(...allowed);
      else
        for (let i = 0; i < count; i++) {
          const picked = r.zonePicks[i];
          if (picked !== undefined) {
            if (picked !== "none")
              zones.push(Number(picked.split(":")[1]) as ZoneNumber);
            continue;
          }
          let legal = allowed.filter((z) => !zones.includes(z));
          if (legal.length === 0) legal = allowed;
          const empty = legal.filter((z) => me.zones[z].length === 0);
          if (empty.length > 0) legal = empty;
          if (legal.length === 0) {
            r.zonePicks.push("none");
            continue;
          }
          if (
            legal.length === 1 &&
            !confirmsSingleOption(state, me.id, "other")
          ) {
            zones.push(legal[0] as ZoneNumber);
            r.zonePicks.push(`${me.id}:${legal[0]}`);
            continue;
          }
          requireChoice(
            state,
            me.id,
            "zone",
            "9.1.2",
            legal.map((zone) => ({
              id: `${me.id}:${zone}`,
              cardId: null,
              abilityId,
            })),
          );
          return "paused";
        }
      // The token joins the catalog the first time one appears (shared catalog: replaced, not
      // written into, decision 168).
      if (!state.cards[token.id])
        state.cards = { ...state.cards, [token.id]: token };
      const made: CardInstance[] = [];
      for (const zone of zones) {
        const card = newInstance(state, token.id, me.id);
        card.playedVia = "effect";
        me.zones[zone].push([card]);
        made.push(card);
        appendLog(state, "place", me.id, {
          rule: "5.11.4",
          cardId: card.cardId,
          instanceId: card.instanceId,
          from: "token",
          to: `zone ${zone}`,
          played: true,
          abilityId,
        });
      }
      bindCards(ctx, effect.as, made);
      return "done";
    }
    case "setRage": {
      for (const player of players(ctx, effect.player)) {
        if (
          effect.value < player.rage &&
          rageProtected(state, player, ctx.master)
        )
          continue;
        setRage(state, player, effect.value, "3.4", { abilityId });
      }
      return "done";
    }
    case "setStrategyZones": {
      // E20 (4.5.2): a third strategy zone for the rest of the game (EBP03-013).
      const me = getPlayer(state, ctx.master);
      while (me.strategyZones.length < effect.count) me.strategyZones.push([]);
      appendLog(state, "strategyZones", me.id, {
        rule: "4.5.2",
        count: me.strategyZones.length,
        abilityId,
      });
      return "done";
    }
    case "loseGame":
    case "winGame": {
      // E16 (1.2.1, 1.2.4): settled with the process's other losses (decision 85).
      const player = playerOf(ctx, effect.player);
      const loser =
        effect.effect === "loseGame" ? player : getOpponent(state, player.id);
      markLoss(state, loser.id, "effect", "1.2.4");
      return "done";
    }
    case "moveMonsterVertically": {
      // E14 (4.4.5.1, Q21): straight across, 3 to 8, 4 to 7, 5 to 6 (or back). Neither an
      // advance nor a retreat; 11.3 applies where it lands at the next check timing.
      const player = playerOf(ctx, effect.player);
      const from = player.monsterPosition;
      const top = topOf(player.invadingMonsterZone);
      if (
        from === null ||
        !top ||
        !effect.fromZones.includes(from) ||
        !select(ctx, { ...effect.filter, area: "monster" }).some(
          (l) => l.card.instanceId === top.instanceId,
        )
      )
        return "done";
      const to = inFrontOf(from) ?? behind(from);
      if (to === null || moveProtected(state, player, ctx.master))
        return "done";
      player.monsterPosition = to;
      appendLog(state, "moveVertically", player.id, {
        rule: "4.4.5.1",
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
    case "playMonster": {
      // E18, Q27: stacked on the invading monster as the new invading monster (5.11.2), keeping
      // its zone (4.7.2); [enter] fires; it isn't the 8.5 action, so it doesn't use it up.
      const me = getPlayer(state, ctx.master);
      const top = topOf(me.invadingMonsterZone);
      if (!top) return "done";
      const rank = getRank(state, top);
      const traits = getCardTraits(cardOf(state, top));
      const candidates = select(ctx, {
        ...effect.filter,
        area: "monsterDeck",
      }).filter((l) => {
        const data = cardOf(state, l.card);
        return (
          data.type === "Monster" &&
          rank !== null &&
          getRank(state, l.card) === rank + effect.rankAbove &&
          (!effect.sharesTrait ||
            getCardTraits(data).some((t) => traits.includes(t)))
        );
      });
      const picked = pickCards(ctx, candidates, { exact: 1 }, me.id, "5.11.2", {
        hidden: true,
      });
      if (picked === "paused") return "paused";
      const [found] = picked;
      if (!found) return "done";
      const card = moved(state, takeCard(found));
      card.playedVia = "effect";
      me.invadingMonsterZone.push(card);
      appendLog(state, "place", me.id, {
        rule: "5.11.2",
        cardId: card.cardId,
        instanceId: card.instanceId,
        from: "monsterDeck",
        to: "invadingMonsterZone",
        played: true,
        abilityId,
      });
      if (effect.increasesRage) setRage(state, me, me.rage + 1, "5.11.2");
      bindCards(ctx, effect.as, [card]);
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
 * Evolves the picked card `r.subject` (5.17, 12.6.2): searches the deck for 1 battle card with
 * its Evolution trait and rank N or lower, plays it on top, then shuffles.
 */
function evolveSubject(
  state: GameState,
  ctx: Context,
  abilityId: string,
): Outcome {
  const r = state.resolution as NonNullable<GameState["resolution"]>;
  if (r.subject === null) return "done";
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
  return replacementsFor(state, card, "destroyed");
}

/**
 * The replacement that would send a strategy card somewhere else instead of to the discard pile
 * at 7.2.3 (E21, EBP02-012), if any; the first by timestamp order of the active cards.
 */
export function strategyReplacementFor(
  state: GameState,
  card: CardInstance,
): Replacement | null {
  return replacementsFor(state, card, "strategyToDiscard")[0] ?? null;
}

/**
 * The replacement that would pay for `player`'s invasion with something other than a hand card
 * (E21 `invasionCost`, 8.6.1, EBP03-004), if their invading monster has one active.
 */
export function invasionCostReplacement(
  state: GameState,
  player: PlayerState,
): Replacement | null {
  const top = topOf(player.invadingMonsterZone);
  return top ? (replacementsFor(state, top, "invasionCost")[0] ?? null) : null;
}

function replacementsFor(
  state: GameState,
  card: CardInstance,
  event: ReplaceableEvent["event"],
): Replacement[] {
  const found: Replacement[] = [];
  for (const { card: source, master } of activeCards(state)) {
    const data = abilitiesOf(state, source);
    if (data.status === "manual") continue;
    for (const ability of data.abilities) {
      if (ability.kind !== "replacement" || ability.replaces.event !== event)
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
      // Optional replacements ask at 7.2.3 (E21); a destroy can't pause for one yet.
      if (ability.optional && event === "destroyed")
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
  bindings: Record<string, Binding> = {},
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
    bindings,
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
