import {
  type Ability,
  type Amount,
  type CardAbilities,
  type Condition,
  type Count,
  type Effect,
  type Gate,
  getCardAbilities,
  getCardTraits,
  type Op,
  type Selector,
  type Trigger,
  type ZoneSet,
} from "@gojisim/cards";
import { requireChoice } from "./choices";
import {
  behind,
  inFrontOf,
  isAdjacent,
  sameColumn,
  type ZoneRef,
} from "./geometry";
import { cardOf, destroyCards, topOf } from "./rules";
import { shuffleInPlace } from "./rng";
import {
  appendLog,
  drawCards,
  getOpponent,
  getPlayer,
  moved,
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
  return found.filter(({ card, player, zone }) => {
    const data = cardOf(state, card);
    if (selector.this && card.instanceId !== ctx.sourceInstanceId) return false;
    if (selector.other && card.instanceId === ctx.sourceInstanceId)
      return false;
    if (selector.type && data.type !== selector.type) return false;
    if (selector.name && data.name !== selector.name) return false;
    if (selector.traits) {
      const traits = getCardTraits(data);
      if (!selector.traits.every((t) => traits.includes(t))) return false;
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
  return boundValue(ctx, amount);
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
  if ("playedVia" in condition)
    return (
      locate(state, ctx.sourceInstanceId)?.card.playedVia ===
      condition.playedVia
    );
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
    default:
      return false;
  }
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
): Extract<Ability, { kind: "triggered" }>[] {
  const data = abilitiesOf(state, source);
  if (data.status === "manual") return [];
  return data.abilities.filter(
    (a): a is Extract<Ability, { kind: "triggered" }> =>
      a.kind === "triggered" &&
      triggerMatches(state, a.trigger, event, source, master) &&
      gatesOpen(state, master, a.gates),
  );
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
  const ability = data?.abilities.find((a) => "id" in a && a.id === id);
  if (
    !ability ||
    ability.kind !== "triggered" ||
    number !== card?.deckCardNumber
  )
    throw new Error(`No triggered ability ${standby.abilityId}`);
  return ability;
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
  };
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

/** Continues the paused resolution after a `target`, `zone` or `confirm` choice. */
export function resumeResolution(
  state: GameState,
  kind: "target" | "zone" | "confirm",
  optionId: string,
): void {
  const r = state.resolution;
  if (!r) throw new Error("No resolution in progress");
  if (kind === "confirm") r.answer = optionId === "yes" ? "yes" : "no";
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
    if (effect.effect !== "discard") return true;
    const hand = select(ctx, discardFilter(effect));
    if (effect.count === "all" || effect.count === "anyNumber") return true;
    return hand.length >= ("exact" in effect.count ? effect.count.exact : 0);
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
 * with no choice when there are N or fewer, unless the area is hidden and the search may find
 * nothing (`mayFindNothing`, 5.8.1.2); "up to N" adds a `done` option. Returns the picked cards,
 * or "paused" while a choice is pending.
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
  const limit = "exact" in count ? count.exact : count.upTo;
  const remaining = limit - chosen.length;
  const canStop = "upTo" in count || options.mayFindNothing === true;
  if (!canStop && left.length <= remaining) return [...chosen, ...left];
  if (remaining <= 0 || left.length === 0 || r.chosen.includes("done"))
    return chosen;
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
      destroyCards(state, targets, "5.12", abilityId);
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
      // That player chooses the cards to keep and discards the rest (5.7.2).
      const hand = select(ctx, {
        owner: effect.player === "you" ? "you" : "opponent",
        area: "hand",
      });
      const keep =
        effect.size === 0
          ? []
          : pickCards(ctx, hand, { exact: effect.size }, player.id, "5.7.2", {
              hidden: true,
            });
      if (keep === "paused") return "paused";
      const kept = new Set(keep.map((k) => k.card.instanceId));
      const rest = hand.filter((l) => !kept.has(l.card.instanceId));
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
      appendLog(state, "search", searcher.id, {
        rule: "5.8.1",
        found: found.length,
        abilityId,
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
        } else if (legal.length === 1) {
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
      for (const player of players(ctx, effect.player)) {
        const from = player.rage;
        // Rage never goes below 0 (3.4.4).
        player.rage = Math.max(0, from + delta);
        appendLog(state, "rageChanged", player.id, {
          rule: from + delta < 0 ? "3.4.4" : "3.4.1",
          from,
          to: player.rage,
          abilityId,
        });
      }
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
