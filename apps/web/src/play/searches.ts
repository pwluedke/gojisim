import type { Count, Selector } from "@gojisim/cards";
import type { GameState, LogEntry } from "@gojisim/engine";
import { cardByNumber, describeSearch } from "../game/labels";
import type { Session } from "../game/session";

/** A finished deck search by a human seat, for the search modal (M5e). */
export interface SearchResult {
  /** The `search` log entry's seq. */
  seq: number;
  player: string;
  /** The card whose ability searched, by card id. */
  sourceCardId: number | null;
  /** What it searched for, e.g. "up to 1 card named Godzilla (2023) of rank 3 with Burst". */
  wanted: string;
  /** The card ids found, as the searcher picked them (seen only by the searcher). */
  found: number[];
  rule: string;
}

const SEARCH_RULES = ["5.8.1", "12.6.2"];

/** The index of the action whose transition wrote log entry `seq` (`states[k]` → `states[k+1]`). */
function actionIndexOf(states: readonly GameState[], seq: number): number {
  for (let k = 0; k + 1 < states.length; k++)
    if ((states[k + 1] as GameState).log.length >= seq) return k;
  return -1;
}

/**
 * The searcher's picks that ended in this search: the run of their own `choose` actions on the
 * same ability's private search choice, back from the action that wrote the entry.
 */
function pickedCards(session: Session, entry: LogEntry): number[] {
  const { states, record } = session;
  const k = actionIndexOf(states, entry.seq);
  const standby = states[k]?.resolution?.standby.standbyId;
  const found: number[] = [];
  for (let j = k; j >= 0; j--) {
    const action = record.actions[j];
    const choice = (states[j] as GameState).pendingChoice;
    if (
      action?.type !== "choose" ||
      action.player !== entry.player ||
      !choice ||
      !SEARCH_RULES.includes(choice.rule) ||
      (states[j] as GameState).resolution?.standby.standbyId !== standby
    )
      break;
    const cardId = choice.options.find((o) => o.id === action.optionId)?.cardId;
    if (cardId !== null && cardId !== undefined) found.unshift(cardId);
  }
  return found;
}

/** Every search by `players` logged after the first `seen` log entries of the current state. */
export function searchResults(
  session: Session,
  seen: number,
  players: readonly string[],
): SearchResult[] {
  const state = session.states[session.position] as GameState;
  return state.log
    .filter(
      (e) =>
        e.seq > seen &&
        e.type === "search" &&
        e.player !== null &&
        players.includes(e.player),
    )
    .map((entry) => {
      const { abilityId, filter, count, rule } = entry.payload as {
        abilityId?: string;
        filter?: Selector;
        count?: Count;
        rule: string;
      };
      const source = abilityId
        ? cardByNumber(state, abilityId.split("#")[0] ?? "")
        : undefined;
      return {
        seq: entry.seq,
        player: entry.player as string,
        sourceCardId: source?.id ?? null,
        wanted: filter && count ? describeSearch(filter, count) : "",
        found: pickedCards(session, entry),
        rule,
      };
    });
}
