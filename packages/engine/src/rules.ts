import { getAbility } from "./abilities";
import {
  applyReplacement,
  replacementFor,
  resolveBurstDiscard,
  resolveDataAbility,
} from "./interpreter";
import { guardLoop } from "./loop";
import { openManualWindow } from "./manual";
import { requireChoice } from "./choices";
import { resolveLosses } from "./losses";
import { appendLog, getPlayer, toDiscard } from "./state";
import { getRank, hasFlag } from "./stats";
import type {
  CardInstance,
  CardStack,
  GameState,
  PlayerId,
  PlayerState,
  StandbyAbility,
  ZoneNumber,
} from "./types";
import { ZONE_NUMBERS } from "./types";

/**
 * Whether card information is a battle card's (Q39, 9.1.4.1): a token is a battle card in zones,
 * so it counts and is checked wherever battle cards are.
 */
export function isBattle(data: { type: string } | undefined): boolean {
  return data?.type === "Battle" || data?.type === "Token";
}

export function cardOf(state: GameState, card: CardInstance) {
  const data = state.cards[card.cardId];
  if (!data) throw new Error(`No card data for card id ${card.cardId}`);
  return data;
}

/** The top card of a stack, whose information is the stack's (3.2.3). */
export function topOf(stack: CardStack): CardInstance | undefined {
  return stack[stack.length - 1];
}

/** Whether a zone stack counts as a battle card: its top card is a battle card. */
function isBattleStack(state: GameState, stack: CardStack): boolean {
  const top = topOf(stack);
  return top !== undefined && isBattle(cardOf(state, top));
}

/**
 * The destroyed top card's last known information on the field (10.6.4.1.2), for `destroyed`
 * triggers: its instance id there and its rank.
 */
interface LastKnown {
  instanceId: string;
  rank: number | null;
}

/** Read while the card is still where it is destroyed, so rank modifiers still apply. */
function lastKnown(state: GameState, stack: CardInstance[]): LastKnown {
  const top = topOf(stack) as CardInstance;
  return { instanceId: top.instanceId, rank: getRank(state, top) };
}

/** Destroys a whole stack: every card goes to its owner's discard pile (5.12, 3.2.4). */
function destroyStack(
  state: GameState,
  player: PlayerState,
  zone: ZoneNumber,
  stack: CardStack,
  rule: string,
  known: LastKnown,
  invasion = false,
) {
  appendLog(state, "destroy", player.id, {
    rule,
    zone,
    cardIds: stack.map((c) => c.cardId),
    ...known,
    // A crush by an advance of an invasion ([invading] ... destroys, 12.3).
    ...(invasion ? { invasion: true } : {}),
  });
  for (const card of stack) toDiscard(state, card);
}

/**
 * Destroys cards an effect chose (5.12), all at once: a card on top of a zone stack takes its whole
 * stack with it (3.2.4); a strategy card leaves its strategy zone.
 */
export function destroyCards(
  state: GameState,
  targets: { card: CardInstance; player: PlayerState; zone?: ZoneNumber }[],
  rule: string,
  cause: string,
  picks: Map<string, string> = new Map(),
  by: PlayerId | null = null,
): void {
  // Replacements first, while each card is still where it would be destroyed (10.9, Q1).
  const replaced = new Set<string>();
  for (const { card } of targets) {
    const replacement = replacementFor(state, card, picks.get(card.instanceId));
    if (!replacement) continue;
    applyReplacement(state, replacement, card, "destroyed", rule);
    replaced.add(card.instanceId);
  }
  const removed: {
    player: PlayerState;
    zone: ZoneNumber | null;
    cards: CardInstance[];
    known: LastKnown;
  }[] = [];
  const known = new Map(
    targets.map((t) => [t.card.instanceId, lastKnown(state, [t.card])]),
  );
  for (const { card, player, zone } of targets) {
    if (replaced.has(card.instanceId)) continue;
    // "Cannot be destroyed by your opponent's effects" (M1): the card may have been chosen, but
    // the destroy does nothing to it (1.3.3; Q35, Paul's provisional ruling).
    if (
      by !== null &&
      by !== player.id &&
      hasFlag(state, card, "cannotBeDestroyedByOpponent")
    ) {
      appendLog(state, "destroyPrevented", player.id, {
        rule: "1.3.3",
        cardId: card.cardId,
        cause,
      });
      continue;
    }
    if (zone !== undefined) {
      const stack = player.zones[zone].find(
        (s) => topOf(s)?.instanceId === card.instanceId,
      );
      if (!stack) continue;
      player.zones[zone] = player.zones[zone].filter((s) => s !== stack);
      removed.push({
        player,
        zone,
        cards: stack,
        known: known.get(card.instanceId) as LastKnown,
      });
      continue;
    }
    const index = player.strategyZones.findIndex((p) =>
      p.some((x) => x.card.instanceId === card.instanceId),
    );
    if (index < 0) continue;
    player.strategyZones[index] =
      player.strategyZones[index]?.filter(
        (p) => p.card.instanceId !== card.instanceId,
      ) ?? [];
    removed.push({
      player,
      zone: null,
      cards: [card],
      known: known.get(card.instanceId) as LastKnown,
    });
  }
  for (const { player, zone, cards, known: info } of removed) {
    appendLog(state, "destroy", player.id, {
      rule,
      ...(zone === null ? { area: "strategy zone" } : { zone }),
      cardIds: cards.map((c) => c.cardId),
      cause,
      ...info,
      // Whose effect destroyed it, for "destroyed by your opponent's effect" (T1).
      ...(by === null ? {} : { by }),
    });
    for (const card of cards) toDiscard(state, card);
  }
}

/**
 * Crush and destroy (11.3), an interrupt rule action: a battle card in the zone its master's
 * invading monster occupies is destroyed at once. Returns how many stacks were destroyed.
 */
export function crushAndDestroy(state: GameState, invasion = false): number {
  let destroyed = 0;
  for (const player of state.players) {
    const zone = player.monsterPosition;
    if (zone === null) continue;
    const crushed = player.zones[zone].filter((stack) =>
      isBattleStack(state, stack),
    );
    if (crushed.length === 0) continue;
    const known = new Map(crushed.map((s) => [s, lastKnown(state, s)]));
    // A replacement (Q1) takes the card out of the zone instead of destroying it.
    const destroyedStacks = crushed.filter((stack) => {
      const top = topOf(stack) as CardInstance;
      const replacement = replacementFor(state, top);
      if (replacement)
        applyReplacement(state, replacement, top, "destroyed", "11.3");
      return !replacement;
    });
    player.zones[zone] = player.zones[zone].filter(
      (stack) => !destroyedStacks.includes(stack),
    );
    for (const stack of destroyedStacks)
      destroyStack(
        state,
        player,
        zone,
        stack,
        "11.3",
        known.get(stack) as LastKnown,
        invasion,
      );
    destroyed += crushed.length;
  }
  return destroyed;
}

interface RuleActions {
  /** 11.4: cards to put into their owner's discard pile, with where they were. */
  illegal: {
    player: PlayerState;
    remove: () => CardInstance[];
    area: string;
  }[];
  /** 11.5: zones and strategy zones holding more than one card. */
  overloaded: {
    player: PlayerState;
    remove: () => CardInstance[][];
    area: string;
    /** For zones: the top cards that would be destroyed, checked for replacements first. */
    losers?: CardInstance[];
    /** For zones: each losing stack's last known information. */
    known?: Map<CardStack, LastKnown>;
  }[];
}

/** Collects the check-timing rule actions (11.4, 11.5) from one snapshot of the state. */
function pendingRuleActions(state: GameState): RuleActions {
  const actions: RuleActions = { illegal: [], overloaded: [] };
  for (const player of state.players) {
    for (const zone of ZONE_NUMBERS) {
      const stacks = player.zones[zone];
      // 11.4.1: a strategy or monster card on top of a zone stack (monster cards belong in the
      // invading monster zone, so any in a zone are not part of an invading monster).
      const illegal = stacks.filter((stack) => {
        const top = topOf(stack);
        const type = top && cardOf(state, top).type;
        return type === "Strategy" || type === "Monster";
      });
      for (const stack of illegal) {
        actions.illegal.push({
          player,
          area: `zone ${zone}`,
          remove: () => {
            const top = stack.pop() as CardInstance;
            if (stack.length === 0)
              player.zones[zone] = player.zones[zone].filter(
                (s) => s !== stack,
              );
            return [top];
          },
        });
      }
      // 11.5.1: more than one battle card in a zone; the last placed stays.
      const battles = stacks.filter((stack) => isBattleStack(state, stack));
      if (battles.length > 1) {
        const losers = battles.slice(0, -1);
        actions.overloaded.push({
          player,
          area: `zone ${zone}`,
          known: new Map(losers.map((s) => [s, lastKnown(state, s)])),
          losers: losers.map((stack) => topOf(stack) as CardInstance),
          remove: () => {
            // A loser a replacement already took away (Q1) is not destroyed.
            const present = losers.filter((s) =>
              player.zones[zone].includes(s),
            );
            player.zones[zone] = player.zones[zone].filter(
              (s) => !losers.includes(s),
            );
            return present;
          },
        });
      }
    }
    player.strategyZones.forEach((placements, index) => {
      // 11.4.1: a non-strategy card in a strategy zone.
      const illegal = placements.filter(
        (p) => cardOf(state, p.card).type !== "Strategy",
      );
      for (const placement of illegal) {
        actions.illegal.push({
          player,
          area: `strategy zone ${index + 1}`,
          remove: () => {
            player.strategyZones[index] =
              player.strategyZones[index]?.filter((p) => p !== placement) ?? [];
            return [placement.card];
          },
        });
      }
      // 11.5.1: more than one strategy card in a strategy zone; the last placed stays.
      const strategies = placements.filter(
        (p) => cardOf(state, p.card).type === "Strategy",
      );
      if (strategies.length > 1) {
        const losers = strategies.slice(0, -1);
        actions.overloaded.push({
          player,
          area: `strategy zone ${index + 1}`,
          remove: () => {
            player.strategyZones[index] =
              player.strategyZones[index]?.filter((p) => !losers.includes(p)) ??
              [];
            return losers.map((p) => [p.card]);
          },
        });
      }
    });
  }
  // 11.4.1.1: nothing waits in the resolution area yet (cards are played from M3c on), so any
  // card left there goes to its owner's discard pile.
  for (const card of state.resolutionArea) {
    const owner = getPlayer(state, card.owner);
    actions.illegal.push({
      player: owner,
      area: "resolution area",
      remove: () => {
        state.resolutionArea = state.resolutionArea.filter((c) => c !== card);
        return [card];
      },
    });
  }
  return actions;
}

export function hasPendingRuleActions(state: GameState): boolean {
  const { illegal, overloaded } = pendingRuleActions(state);
  return illegal.length > 0 || overloaded.length > 0;
}

/** Performs all pending check-timing rule actions at once (11.1.3). Returns whether any ran. */
function resolveRuleActionsOnce(state: GameState): boolean {
  const { illegal, overloaded } = pendingRuleActions(state);
  if (illegal.length === 0 && overloaded.length === 0) return false;
  // Overload with a replacement (Q1): the old card goes where the replacement says (for example
  // the bottom of the deck) instead of being destroyed; the new card stays.
  for (const { losers } of overloaded)
    for (const card of losers ?? []) {
      const replacement = replacementFor(state, card);
      if (replacement)
        applyReplacement(state, replacement, card, "destroyed", "11.5");
    }
  // Remove everything from the same snapshot first, then move it, so they happen together.
  const removedIllegal = illegal.map((a) => ({ ...a, cards: a.remove() }));
  const removedOverloaded = overloaded.map((a) => ({
    ...a,
    stacks: a.remove(),
  }));
  for (const { player, area, cards } of removedIllegal) {
    appendLog(state, "illegalCard", player.id, {
      rule: "11.4",
      area,
      cardIds: cards.map((c) => c.cardId),
    });
    for (const card of cards) toDiscard(state, card);
  }
  for (const { player, area, stacks, known } of removedOverloaded) {
    for (const stack of stacks) {
      appendLog(state, "destroy", player.id, {
        rule: "11.5",
        area,
        cardIds: stack.map((c) => c.cardId),
        ...(known?.get(stack) ?? lastKnown(state, stack)),
      });
      for (const card of stack) toDiscard(state, card);
    }
  }
  return true;
}

/**
 * Plays and resolves one ability from standby (10.6.3). An ability with no registered behavior
 * cannot be played and simply leaves standby (10.6.3.2).
 */
export function resolveStandby(state: GameState, standbyId: string): void {
  const index = state.standby.findIndex((a) => a.standbyId === standbyId);
  const [ability] = state.standby.splice(index, 1);
  if (!ability) throw new Error(`No standby ability ${standbyId}`);
  const definition = getAbility(ability.abilityId);
  if (ability.abilityId === "timed:burstDiscard") {
    appendLog(state, "resolveAbility", ability.master, {
      rule: "10.6.5",
      standbyId,
      abilityId: ability.abilityId,
      cardId: ability.sourceCardId,
    });
    resolveBurstDiscard(state, ability);
    return;
  }
  if (!definition && ability.abilityId.includes("#")) {
    appendLog(state, "resolveAbility", ability.master, {
      rule: "10.6.3",
      standbyId,
      abilityId: ability.abilityId,
      cardId: ability.sourceCardId,
    });
    resolveDataAbility(state, ability);
    resolveLosses(state);
    return;
  }
  if (!definition) {
    appendLog(state, "abilityNotPlayed", ability.master, {
      rule: "10.6.3.2",
      standbyId,
      abilityId: ability.abilityId,
    });
    return;
  }
  appendLog(state, "resolveAbility", ability.master, {
    rule: "10.6.3",
    standbyId,
    abilityId: ability.abilityId,
    cardId: ability.sourceCardId,
  });
  definition.resolve(state, ability);
  resolveLosses(state);
}

/** Standby entries that are copies of one ability from one card: their order cannot matter. */
function interchangeable(abilities: StandbyAbility[]): boolean {
  const [first] = abilities;
  return abilities.every(
    (a) =>
      a.abilityId === first?.abilityId &&
      a.sourceInstanceId === first.sourceInstanceId,
  );
}

/**
 * Check timing (10.4.3): resolve rule actions until none are left (10.4.3.1); then the turn
 * player plays one of their standby abilities (10.4.3.2), or else the non-turn player does
 * (10.4.3.3), and it starts again from 10.4.3.1; when no ability is left, it ends (10.4.3.4).
 * When a player has several different abilities in standby they choose the order (10.6.3.1):
 * the check timing stops with a `standbyOrder` choice and continues after it.
 */
export function checkTiming(state: GameState, rule: string): void {
  appendLog(state, "checkTiming", null, { rule });
  state.checkTiming = { rule };
  continueCheckTiming(state);
}

export function continueCheckTiming(state: GameState): void {
  while (
    state.checkTiming !== null &&
    state.result === null &&
    state.pendingChoice === null
  ) {
    for (;;) {
      // Interrupt rule actions whose condition holds are performed too (11.1.2.1).
      const crushed = crushAndDestroy(state);
      const resolved = resolveRuleActionsOnce(state);
      if (crushed === 0 && !resolved) break;
    }
    if (resolveLosses(state)) return;
    const nonTurnPlayer = state.players.find(
      (p) => p.id !== state.turnPlayer,
    )?.id;
    const order = [state.turnPlayer, nonTurnPlayer];
    const master = order.find((id) =>
      state.standby.some((a) => a.master === id),
    );
    if (master === undefined) {
      // Manual cards whose text would apply get a manual override window, one at a time.
      if (openManualWindow(state)) return;
      state.checkTiming = null;
      return;
    }
    const mine = state.standby.filter((a) => a.master === master);
    if (interchangeable(mine)) {
      const earliest = mine.reduce((a, b) =>
        b.timestamp < a.timestamp ? b : a,
      );
      // An ability loop never leaves this check timing, so it is checked here too (13.1): before
      // each resolution, since the engine step that ran this check timing checks the state after it.
      if (guardLoop(state)) return;
      resolveStandby(state, earliest.standbyId);
    } else {
      requireChoice(
        state,
        master,
        "standbyOrder",
        master === state.turnPlayer ? "10.4.3.2" : "10.4.3.3",
        mine.map((a) => ({
          id: a.standbyId,
          cardId: a.sourceCardId,
          abilityId: a.abilityId,
        })),
      );
    }
  }
}
