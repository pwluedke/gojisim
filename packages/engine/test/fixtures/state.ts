import type { Card } from "@gojisim/cards";
import {
  advance,
  applyAction,
  type CardInstance,
  createGame,
  type GameState,
  type PlayerState,
  type Step,
} from "../../src";
import { testCard, testGameOptions } from "./cards";

/** A new game from the standard fixture decks. */
export function newGame(seed: number | string = 42): GameState {
  return createGame(testGameOptions(seed));
}

export function turnPlayer(state: GameState): PlayerState {
  return state.players.find((p) => p.id === state.turnPlayer) as PlayerState;
}

export function nonTurnPlayer(state: GameState): PlayerState {
  return state.players.find((p) => p.id !== state.turnPlayer) as PlayerState;
}

/**
 * Puts a card into the game: adds its data to the catalog and returns a new instance. Tests then
 * place the instance wherever the case needs it (state is plain JSON).
 */
export function addCard(
  state: GameState,
  card: Card,
  owner: string,
): CardInstance {
  // The catalog is shared between states (decision 168): replace it, never write into it.
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${state.nextInstanceId++}`, cardId: card.id, owner };
}

let nextFixtureId = 950000;

export function battleCard(overrides: Partial<Card> = {}): Card {
  return testCard({ id: nextFixtureId++, type: "Battle", ...overrides });
}

export function strategyCard(overrides: Partial<Card> = {}): Card {
  return testCard({
    id: nextFixtureId++,
    type: "Strategy",
    counterOrThreat: null,
    ...overrides,
  });
}

export function monsterCard(rank: number, overrides: Partial<Card> = {}): Card {
  return testCard({
    id: nextFixtureId++,
    type: "Monster",
    rank,
    traits: ["Testzilla"],
    counterOrThreat: 5000 + rank * 1000,
    ...overrides,
  });
}

/** Moves `count` cards from the player's hand to the bottom of their deck. */
export function shrinkHand(player: PlayerState, size: number): void {
  while (player.hand.length > size)
    player.deck.push(player.hand.pop() as CardInstance);
}

/** Sets the state to just before `step` (tests use this to run a single step). */
export function at(state: GameState, step: Step): GameState {
  const phase = step.startsWith("7.2")
    ? "start"
    : step.startsWith("7.3")
      ? "main"
      : step.startsWith("7.4")
        ? "counter"
        : "end";
  return { ...state, phase, step };
}

/**
 * Runs engine steps until `state.step === step`, passing at every main phase play timing on the
 * way. Throws if it takes more than `maxSteps`.
 */
export function runTo(state: GameState, step: Step, maxSteps = 200): GameState {
  let current = state;
  for (let i = 0; i < maxSteps; i++) {
    if (current.step === step) return current;
    current =
      current.step === "7.3.2"
        ? applyAction(current, { type: "pass", player: current.turnPlayer })
        : advance(current);
  }
  throw new Error(`Did not reach ${step} within ${maxSteps} steps`);
}

export function logTypes(state: GameState, fromSeq = 0): string[] {
  return state.log.filter((e) => e.seq > fromSeq).map((e) => e.type);
}
