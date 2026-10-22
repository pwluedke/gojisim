import { appendLog, getOpponent } from "./state";
import type { GameState, PlayerId, ResultReason } from "./types";

/** Records that a player loses; `resolveLosses` settles all losses of the process together. */
export function markLoss(
  state: GameState,
  player: PlayerId,
  reason: ResultReason,
  rule: string,
): void {
  if (state.result !== null) return;
  state.pendingLosses.push({ player, reason, rule });
  appendLog(state, "loss", player, { rule, reason });
}

/**
 * Ends the game if anyone lost in the current process (1.2.1): one loser means the opponent
 * wins; both players losing at once is a draw (1.2.2). Returns whether the game ended.
 */
export function resolveLosses(state: GameState): boolean {
  const losses = state.pendingLosses;
  if (losses.length === 0 || state.result !== null) {
    state.pendingLosses = [];
    return state.result !== null;
  }
  state.pendingLosses = [];
  const losers = new Set(losses.map((l) => l.player));
  if (losers.size === state.players.length) {
    state.result = { winner: null, reason: "draw", rule: "1.2.2" };
  } else {
    const [loss] = losses;
    if (!loss) return false;
    const winner = getOpponent(state, loss.player).id;
    state.result = { winner, reason: loss.reason, rule: loss.rule };
  }
  appendLog(state, "gameOver", state.result.winner, {
    rule: state.result.rule,
    winner: state.result.winner,
    reason: state.result.reason,
  });
  state.pendingChoice = null;
  state.checkTiming = null;
  return true;
}
