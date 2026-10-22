import {
  type Ability,
  type Amount,
  type CardAbilities,
  type Condition,
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
import { appendLog, drawCards, getOpponent, getPlayer } from "./state";
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
    throw new Error("not implemented: condition playedVia");
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
      // Played (12.2): placed from the resolution area, or made the new invading monster (5.11.2).
      return (
        own &&
        ((event.type === "place" &&
          event.payload["from"] === "resolutionArea" &&
          !String(event.payload["to"]).startsWith("strategy")) ||
          event.type === "newInvadingMonster")
      );
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

function findAbility(state: GameState, standby: StandbyAbility) {
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
 * Resolves a data ability from standby (10.6.3): gates again (Q7), then its condition, then its
 * effects in order. A choice pauses it in `state.resolution`; `resumeResolution` continues.
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
  if (ability.optional) throw new Error("not implemented: optional ability");
  if (ability.cost) throw new Error("not implemented: cost");
  state.resolution = { standby, effectIndex: 0, bindings: {}, chosen: [] };
  if (
    ability.condition &&
    !conditionHolds(contextOf(state), ability.condition)
  ) {
    state.resolution = null;
    appendLog(state, "conditionNotMet", standby.master, {
      rule: "10.5.2.3.3",
      abilityId: standby.abilityId,
    });
    return;
  }
  runEffects(state);
}

/** Continues the paused resolution after a `target` or `zone` choice. */
export function resumeResolution(state: GameState, optionId: string): void {
  const r = state.resolution;
  if (!r) throw new Error("No resolution in progress");
  r.chosen.push(optionId);
  runEffects(state);
}

function runEffects(state: GameState): void {
  const r = state.resolution;
  if (!r) return;
  const ability = findAbility(state, r.standby);
  while (r.effectIndex < ability.effects.length && state.result === null) {
    // Gates are checked again before each effect: an Awakening gate can close mid-resolution (Q7).
    if (!gatesOpen(state, r.standby.master, ability.gates)) {
      appendLog(state, "abilityInactive", r.standby.master, {
        rule: "10.3.2",
        abilityId: r.standby.abilityId,
      });
      break;
    }
    const effect = ability.effects[r.effectIndex] as Effect;
    if (perform(state, effect) === "paused") return;
    r.effectIndex++;
    r.chosen = [];
  }
  state.resolution = null;
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

function perform(state: GameState, effect: Effect): Outcome {
  const ctx = contextOf(state);
  const r = state.resolution as NonNullable<GameState["resolution"]>;
  switch (effect.effect) {
    case "destroy": {
      const { select: selector, count, chooser } = effect.target;
      const candidates = select(ctx, selector).filter(
        (l) => !r.chosen.includes(l.card.instanceId),
      );
      const chosen = r.chosen.filter((id) => id !== "done");
      let targets: Located[];
      if (count === "all") targets = candidates;
      else if (count === "anyNumber")
        throw new Error("not implemented: destroy anyNumber");
      else {
        const limit = "exact" in count ? count.exact : count.upTo;
        const stop = r.chosen.includes("done");
        const remaining = limit - chosen.length;
        // Exactly N: as many as possible, with no choice when there are N or fewer (10.5.3.1).
        if ("exact" in count && candidates.length <= remaining) {
          targets = [
            ...chosen
              .map((id) => locate(state, id))
              .filter((l): l is Located => !!l),
            ...candidates,
          ];
        } else if (remaining > 0 && candidates.length > 0 && !stop) {
          const player =
            chooser === "you" ? ctx.master : getOpponent(state, ctx.master).id;
          requireChoice(state, player, "target", "10.5.3", [
            ...candidates.map((l) => ({
              id: l.card.instanceId,
              cardId: l.card.cardId,
              abilityId: r.standby.abilityId,
            })),
            ...("upTo" in count
              ? [{ id: "done", cardId: null, abilityId: r.standby.abilityId }]
              : []),
          ]);
          return "paused";
        } else
          targets = chosen
            .map((id) => locate(state, id))
            .filter((l): l is Located => !!l);
      }
      bindCards(
        ctx,
        effect.as,
        targets.map((t) => t.card),
      );
      destroyCards(state, targets, "5.12", r.standby.abilityId);
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
          abilityId: r.standby.abilityId,
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
          abilityId: r.standby.abilityId,
        });
      }
      return "done";
    }
    case "chooseZone": {
      const [choice] = r.chosen;
      if (choice === undefined) {
        const owner =
          effect.owner === "you"
            ? getPlayer(state, ctx.master)
            : getOpponent(state, ctx.master);
        requireChoice(
          state,
          ctx.master,
          "zone",
          "10.5.2.2",
          ZONE_NUMBERS.map((zone) => ({
            id: `${owner.id}:${zone}`,
            cardId: null,
            abilityId: r.standby.abilityId,
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
