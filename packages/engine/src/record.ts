import { applyAction } from "./actions";
import { advanceToDecision } from "./phases";
import { createGame, type PlayerSetup } from "./setup";
import { failedRules, validateDeck } from "@gojisim/cards";
import type { Action, FirstPick, GameState, PlayerId } from "./types";

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
  /**
   * Who sat in each seat (M6d): a human, or a bot with its settings. Replays use the recorded
   * actions and never re-run a bot, so this is information only.
   */
  seats?: Record<PlayerId, SeatRecord>;
  /** The seed the bots' random choices came from (M6d). */
  botSeed?: string;
  /**
   * Players who confirm every target pick (M5d, `GameState.confirmSingleTarget`). It changes
   * which choices are asked, so replay needs it; older records have none.
   */
  confirmSingleTarget?: PlayerId[];
  /** Players who confirm every single-option choice (M5e, `GameState.confirmSingleOption`). */
  confirmSingleOption?: PlayerId[];
  /** The First / Second pick (M5e); replay needs it. Without it, 6.3.1.4 picks at random. */
  firstPick?: FirstPick;
  /**
   * Casual or Tournament (M5e). Casual allows undo in `/play`; an undo removes actions from the
   * record, so the record keeps the final line only. Information only for the engine.
   */
  mode?: MatchMode;
  /**
   * The human saw the bot's hand all game (M5h #13, a `/play` setting). Information only: such
   * games never count toward win/loss statistics (M11).
   */
  showOpponentHand?: boolean;
  /**
   * Casual undos (M5h #10), oldest first: what was taken back, by whom and when. Information
   * only: replay never reads it (the taken-back actions are gone from `actions`).
   */
  undos?: UndoEntry[];
  /** How many times each player undid in this game (M5h #10; "takesies-backsies" in M11). */
  undoCount?: Partial<Record<PlayerId, number>>;
  /**
   * Each deck's name as picked on the new-game screen (M5h #18, the fight-card header).
   * Information only; a record without it shows "Mystery Deck".
   */
  deckNames?: Partial<Record<PlayerId, string>>;
}

/** One undo (M5h #10): the action taken back, and where it was in the record. */
export interface UndoEntry {
  player: PlayerId;
  /** ISO time of the undo. */
  at: string;
  /** The taken-back action's index in `actions` when it was taken back. */
  index: number;
  action: Action;
  /** How the log read the action (`actionLabel`), kept since its state is gone. */
  label: string;
}

export type MatchMode = "casual" | "tournament";

/** One seat of a recorded game (M6d). */
export type SeatRecord =
  | { kind: "human" }
  | {
      kind: "bot";
      /** Bot name, e.g. "ismcts". */
      bot: string;
      settings: Record<string, number | string | boolean>;
    };

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
  record: Pick<
    GameRecord,
    | "seed"
    | "decks"
    | "confirmSingleTarget"
    | "confirmSingleOption"
    | "firstPick"
  >,
): GameState {
  return advanceToDecision(
    createGame({
      seed: record.seed,
      players: record.decks,
      ...(record.confirmSingleTarget
        ? { confirmSingleTarget: record.confirmSingleTarget }
        : {}),
      ...(record.confirmSingleOption
        ? { confirmSingleOption: record.confirmSingleOption }
        : {}),
      ...(record.firstPick ? { firstPick: record.firstPick } : {}),
    }),
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
