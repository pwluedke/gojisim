import type { Action, GameState, PlayerId } from "./types";

/** Legal actions for `playerId`. Stub until the main phase arrives in M3c. */
export function getLegalActions(
  _state: GameState,
  _playerId: PlayerId,
): Action[] {
  return [];
}

/** Applies an action and returns the new state. Stub until M3b/M3c. */
export function applyAction(_state: GameState, _action: Action): GameState {
  throw new Error("applyAction: not implemented");
}
