import { applyAction } from "./actions";
import { advanceToDecision } from "./phases";
import { createGame, type PlayerSetup } from "./setup";
import { failedRules, validateDeck } from "@gojisim/cards";
import type { Action, GameState, PlayerId } from "./types";

/**
 * Everything needed to rebuild a game: the seed, both decks and every action taken. The engine is
 * deterministic, so replaying the record reproduces the game exactly.
 */
export interface GameRecord {
  version: 1;
  seed: number | string;
  decks: [PlayerSetup, PlayerSetup];
  actions: Action[];
  /**
   * Each deck's legality when the game started. Illegal decks are allowed in every mode with a
   * warning (Paul's ruling, Oct 21, 2026), so replays and stats can mark such games. Optional
   * so records made before it existed still load; replay ignores it.
   */
  deckLegality?: DeckLegality[];
}

/** One player's deck check at game start (spec "Setup", step 1). */
export interface DeckLegality {
  player: PlayerId;
  legal: boolean;
  /** Failed rule numbers, e.g. ["6.1.1.4", "Restriction list"]. */
  failedRules: string[];
  /** The date the deck was checked against (restriction lists depend on it). */
  asOf: string;
}

/** Validates both decks of a game on `asOf` (spec "Setup", step 1). */
export function deckLegalityFor(
  decks: readonly PlayerSetup[],
  asOf: Date,
): DeckLegality[] {
  return decks.map((deck) => {
    const validation = validateDeck(deck, asOf);
    return {
      player: deck.id,
      legal: validation.legal,
      failedRules: failedRules(validation),
      asOf: asOf.toISOString().slice(0, 10),
    };
  });
}

/** A new game, advanced to its first decision. */
export function startGame(
  record: Pick<GameRecord, "seed" | "decks">,
): GameState {
  return advanceToDecision(
    createGame({ seed: record.seed, players: record.decks }),
  );
}

/**
 * Rebuilds the state after the first `upToIndex` actions (default: all of them): `createGame`,
 * then each action, with `advanceToDecision` between actions to reach the next decision.
 */
export function replay(
  record: GameRecord,
  upToIndex = record.actions.length,
): GameState {
  let state = startGame(record);
  for (const action of record.actions.slice(0, upToIndex)) {
    state = advanceToDecision(applyAction(state, action));
  }
  return state;
}

/** Every state of a record: index `i` is the state after `i` actions. */
export function replayAll(record: GameRecord): GameState[] {
  const states = [startGame(record)];
  for (const action of record.actions) {
    states.push(
      advanceToDecision(
        applyAction(states[states.length - 1] as GameState, action),
      ),
    );
  }
  return states;
}
