import { appendLog, getPlayer, toDiscard } from "./state";
import type {
  CardInstance,
  CardStack,
  GameState,
  PlayerState,
  ZoneNumber,
} from "./types";
import { ZONE_NUMBERS } from "./types";

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
  return top !== undefined && cardOf(state, top).type === "Battle";
}

/** Destroys a whole stack: every card goes to its owner's discard pile (5.12, 3.2.4). */
function destroyStack(
  state: GameState,
  player: PlayerState,
  zone: ZoneNumber,
  stack: CardStack,
  rule: string,
) {
  appendLog(state, "destroy", player.id, {
    rule,
    zone,
    cardIds: stack.map((c) => c.cardId),
  });
  for (const card of stack) toDiscard(state, card);
}

/**
 * Crush and destroy (11.3), an interrupt rule action: a battle card in the zone its master's
 * invading monster occupies is destroyed at once. Returns how many stacks were destroyed.
 */
export function crushAndDestroy(state: GameState): number {
  let destroyed = 0;
  for (const player of state.players) {
    const zone = player.monsterPosition;
    if (zone === null) continue;
    const crushed = player.zones[zone].filter((stack) =>
      isBattleStack(state, stack),
    );
    if (crushed.length === 0) continue;
    player.zones[zone] = player.zones[zone].filter(
      (stack) => !crushed.includes(stack),
    );
    for (const stack of crushed)
      destroyStack(state, player, zone, stack, "11.3");
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
          remove: () => {
            player.zones[zone] = player.zones[zone].filter(
              (s) => !losers.includes(s),
            );
            return losers;
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
  for (const { player, area, stacks } of removedOverloaded) {
    for (const stack of stacks) {
      appendLog(state, "destroy", player.id, {
        rule: "11.5",
        area,
        cardIds: stack.map((c) => c.cardId),
      });
      for (const card of stack) toDiscard(state, card);
    }
  }
  return true;
}

/**
 * Check timing (10.4.3). Resolves rule actions until none are left (10.4.3.1). Abilities in
 * standby (10.4.3.2, 10.4.3.3) arrive in M3d; the standby list stays in the state, empty.
 */
export function checkTiming(state: GameState, rule: string): void {
  appendLog(state, "checkTiming", null, { rule });
  for (;;) {
    // Interrupt rule actions whose condition holds are performed too (11.1.2.1).
    const crushed = crushAndDestroy(state);
    const resolved = resolveRuleActionsOnce(state);
    if (crushed === 0 && !resolved) break;
  }
  if (state.standby.length > 0) {
    throw new Error(
      "Abilities in standby are not supported until M3d (10.4.3.2)",
    );
  }
}
