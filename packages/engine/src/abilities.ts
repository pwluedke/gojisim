import type {
  CardInstance,
  GameState,
  LogEntry,
  PlayerId,
  StandbyAbility,
} from "./types";
import { ZONE_NUMBERS } from "./types";
import {
  activeOutsideField,
  dataAbilityId,
  dataTriggers,
  delayedTriggers,
} from "./interpreter";
import { manualReason, queueManual } from "./manual";

/** What an ability's trigger check sees. */
export interface TriggerContext {
  state: GameState;
  /** The event: every log entry is an engine event (draw, move, advance, phase begins, ...). */
  event: LogEntry;
  /** The card carrying the ability. */
  source: CardInstance;
  /** The player whose area the card is in. */
  master: PlayerId;
}

/**
 * A test-only automatic ability kept in code (10.1.1.1); the state only holds JSON standby entries
 * that name it by `abilityId`. Card abilities are data, run by `interpreter.ts`; this registry
 * stays for engine fixtures and is exported only from `src/testing.ts`.
 */
export interface AbilityDefinition {
  abilityId: string;
  /** Cards (by `Card.id`) that carry this ability. */
  cardIds: readonly number[];
  /** Whether `event` fulfils the trigger condition (10.6.2). */
  triggers(context: TriggerContext): boolean;
  /** Performs the effect. It may mutate `state`, including marking losses. */
  resolve(state: GameState, ability: StandbyAbility): void;
}

const registry = new Map<string, AbilityDefinition>();

export function registerAbility(definition: AbilityDefinition): void {
  registry.set(definition.abilityId, definition);
}

export function unregisterAbility(abilityId: string): void {
  registry.delete(abilityId);
}

export function getAbility(abilityId: string): AbilityDefinition | undefined {
  return registry.get(abilityId);
}

/**
 * Cards whose abilities are active (10.3.4): the top card of each stack in a zone, the invading
 * monster (3.3.3.2), and strategy cards in strategy zones. A card stacked under another card has
 * no active abilities (3.2.3.1).
 */
export function activeCards(
  state: GameState,
): { card: CardInstance; master: PlayerId }[] {
  const active: { card: CardInstance; master: PlayerId }[] = [];
  for (const player of state.players) {
    for (const zone of ZONE_NUMBERS) {
      for (const stack of player.zones[zone]) {
        const top = stack[stack.length - 1];
        if (top) active.push({ card: top, master: player.id });
      }
    }
    const monster =
      player.invadingMonsterZone[player.invadingMonsterZone.length - 1];
    if (monster) active.push({ card: monster, master: player.id });
    for (const placements of player.strategyZones) {
      for (const placement of placements)
        active.push({ card: placement.card, master: player.id });
    }
  }
  return active;
}

/**
 * The trigger check every event passes through: each active ability whose trigger condition the
 * event fulfils enters standby, once per match (10.6.2, 10.6.2.1). Returns the new entries.
 */
export function fireTriggers(
  state: GameState,
  event: LogEntry,
): StandbyAbility[] {
  if (state.result !== null) return [];
  const entered: StandbyAbility[] = [];
  const enter = (card: CardInstance, master: PlayerId, abilityId: string) => {
    const timestamp = state.nextTimestamp++;
    const ability: StandbyAbility = {
      standbyId: `s${timestamp}`,
      abilityId,
      sourceInstanceId: card.instanceId,
      sourceCardId: card.cardId,
      master,
      timestamp,
      event,
    };
    state.standby.push(ability);
    entered.push(ability);
  };
  // Abilities created by an `until` effect (T8, 10.6.5): checked whether or not their card is
  // still active, until their period ends.
  for (const timed of state.timedTriggers)
    if (timed.kind === "delayed" && delayedTriggers(state, event, timed))
      enter(
        {
          instanceId: timed.sourceInstanceId,
          cardId: timed.sourceCardId,
          owner: timed.master,
        },
        timed.master,
        timed.abilityId,
      );
  // Timed triggers (10.6.5) fire once, whether or not their card is still active (12.5.2.1).
  if (event.type === "phaseBegins" && event.payload["phase"] === "end") {
    const due = state.timedTriggers.filter(
      (t) => t.kind === "burstDiscard" && t.master === state.turnPlayer,
    );
    state.timedTriggers = state.timedTriggers.filter((t) => !due.includes(t));
    for (const timed of due)
      enter(
        {
          instanceId: timed.sourceInstanceId,
          cardId: timed.sourceCardId,
          owner: timed.master,
        },
        timed.master,
        "timed:burstDiscard",
      );
  }
  for (const { card, master } of activeCards(state)) {
    // Card ability data: the trigger matches and the gates are open (format.md, Q7, Q9).
    const number = state.cards[card.cardId]?.deckCardNumber ?? "";
    for (const ability of dataTriggers(state, event, card, master))
      enter(card, master, dataAbilityId(number, ability.id));
    // A manual card (no ability data): queue a manual override window instead (format.md 10).
    const reason = manualReason(state, event, card, master);
    if (reason) queueManual(state, card, master, reason);
    for (const definition of registry.values()) {
      if (!definition.cardIds.includes(card.cardId)) continue;
      if (!definition.triggers({ state, event, source: card, master }))
        continue;
      enter(card, master, definition.abilityId);
    }
  }
  // Abilities active in a hand or discard pile ("when this card is discarded from your hand", T3).
  for (const player of state.players)
    for (const area of ["hand", "discard"] as const)
      for (const card of player[area]) {
        if (!activeOutsideField(state, card, area)) continue;
        const number = state.cards[card.cardId]?.deckCardNumber ?? "";
        for (const ability of dataTriggers(state, event, card, player.id, area))
          enter(card, player.id, dataAbilityId(number, ability.id));
      }
  return entered;
}
