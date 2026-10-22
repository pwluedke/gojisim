import { cloneState, isAtPlayTiming } from "./phases";
import { appendLog } from "./state";
import type { Action, GameState, PlayerId } from "./types";

/** Legal actions for `playerId`. In M3b the only main-phase action is `pass`. */
export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
): Action[] {
  if (!isAtPlayTiming(state) || playerId !== state.turnPlayer) return [];
  return [{ type: "pass", player: playerId }];
}

/** Applies a player's action and returns the new state. Throws on an illegal action. */
export function applyAction(state: GameState, action: Action): GameState {
  const legal = getLegalActions(state, action.player);
  if (!legal.some((a) => a.type === action.type)) {
    throw new Error(
      `Illegal action ${action.type} for ${action.player} at step ${state.step} (turn player ${state.turnPlayer})`,
    );
  }
  const next = cloneState(state);
  // 10.4.4.3: the player chose to do nothing, so the play timing and the main phase end (7.3.2).
  appendLog(next, "pass", action.player, { rule: "10.4.4.3" });
  next.phase = "counter";
  next.step = "7.4.1";
  return next;
}
