import { applyAction } from "./actions";
import { advanceToDecision } from "./phases";
import { createGame, type PlayerSetup } from "./setup";
import type { Action, GameState } from "./types";

/**
 * Everything needed to rebuild a game: the seed, both decks and every action taken. The engine is
 * deterministic, so replaying the record reproduces the game exactly.
 */
export interface GameRecord {
  version: 1;
  seed: number | string;
  decks: [PlayerSetup, PlayerSetup];
  actions: Action[];
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
