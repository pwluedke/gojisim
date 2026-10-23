import { type GameRecord, replay } from "./record";
import type { Action, GameState, PlayerId } from "./types";

/**
 * Why an action can't be taken back (M5e Casual undo). Undo never crosses one of these: a draw,
 * a search (found or not), a reveal, a shuffle, any random result, an action by the opponent, or
 * the end of the game.
 */
export type UndoBoundary =
  | "opponentAction"
  | "draw"
  | "search"
  | "reveal"
  | "shuffle"
  | "random"
  | "gameOver";

/** Log entries that make new information known, by the boundary they are. */
const BOUNDARY_LOGS: Record<string, UndoBoundary> = {
  draw: "draw",
  reshuffle: "draw",
  search: "search",
  reveal: "reveal",
  shuffleDeck: "shuffle",
};

/** Whether the pending choice shows `player` cards from a deck or monster deck (a search pick). */
function looksIntoDeck(state: GameState): boolean {
  const choice = state.pendingChoice;
  if (!choice) return false;
  const inDecks = new Set(
    state.players.flatMap((p) =>
      [...p.deck, ...p.monsterDeck].map((c) => c.instanceId),
    ),
  );
  return choice.options.some((o) => inDecks.has(o.id));
}

/**
 * The boundary `action` crossed on its way from `before` to `after` (the next decision), or
 * `null` when `player` may take it back. Only `player`'s own actions can be undone.
 */
export function undoBoundary(
  before: GameState,
  after: GameState,
  action: Action,
  player: PlayerId,
): UndoBoundary | null {
  if (action.player !== player) return "opponentAction";
  if (after.result !== null) return "gameOver";
  for (const entry of after.log.slice(before.log.length)) {
    const boundary = BOUNDARY_LOGS[entry.type];
    if (boundary) return boundary;
  }
  // A search pick is open: the searcher has looked at the deck, before the `search` log entry.
  if (looksIntoDeck(after)) return "search";
  if (after.revealed.some((id) => !before.revealed.includes(id)))
    return "reveal";
  if (after.rngState !== before.rngState) return "random";
  return null;
}

/**
 * Whether `player` may undo the record's last action (M5e): it is theirs and crossed no
 * boundary. `states[i]` is the state after `i` actions, as in `replayAll`.
 */
export function canUndo(
  record: GameRecord,
  states: readonly GameState[],
  player: PlayerId,
): boolean {
  const n = record.actions.length;
  if (n === 0 || states.length !== n + 1) return false;
  return (
    undoBoundary(
      states[n - 1] as GameState,
      states[n] as GameState,
      record.actions[n - 1] as Action,
      player,
    ) === null
  );
}

/**
 * Takes back the last action by replaying the record without it (M5e). The undo is not a game
 * action: the returned record simply ends one action earlier.
 */
export function undoLast(record: GameRecord): {
  record: GameRecord;
  state: GameState;
} {
  if (record.actions.length === 0) throw new Error("Nothing to undo");
  const shorter = { ...record, actions: record.actions.slice(0, -1) };
  return { record: shorter, state: replay(shorter) };
}
