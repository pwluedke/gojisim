import type { NamedDeck } from "@gojisim/cards/deck-lists";
import {
  type Action,
  advanceToDecision,
  applyAction,
  canUndo,
  deckLegalityFor,
  type FirstPick,
  type GameRecord,
  type GameState,
  type MatchMode,
  replayAll,
  startGame,
  undoLast,
} from "@gojisim/engine";
import { type SeatConfig, seatFromRecord, seatRecord } from "./bots";
import type { DeckOption } from "./decks";

/**
 * A game being played or replayed in the browser (shared by `/debug` and `/play`): the record,
 * every state along it, where the viewer is, and who sits in each seat.
 */

export const PLAYER_IDS = ["P1", "P2"] as const;
export type PlayerId = (typeof PLAYER_IDS)[number];

/** A record plus the action index the viewer was at when it was exported. */
export interface ExportedRecord extends GameRecord {
  position?: number;
}

export interface Session {
  record: GameRecord;
  /** `states[i]` is the state after `i` actions. */
  states: GameState[];
  position: number;
  /** Who plays each seat (M6d). */
  seats: Record<PlayerId, SeatConfig>;
  /** Seed for the bots' random choices; each decision uses `<botSeed>-<action index>`. */
  botSeed: string;
  /** Bot action labels for the log (M6d). */
  labels: { afterSeq: number; text: string }[];
}

/** Applies an action at the end of the session (or at its position, dropping later actions). */
export function withAction(
  session: Session,
  action: Action,
  label?: string,
): Session {
  const state = session.states[session.position] as GameState;
  const next = advanceToDecision(applyAction(state, action));
  const actions = [
    ...session.record.actions.slice(0, session.position),
    action,
  ];
  const keptLabels = session.labels.filter(
    (l) => l.afterSeq < state.log.length,
  );
  return {
    ...session,
    record: { ...session.record, actions },
    states: [...session.states.slice(0, session.position + 1), next],
    position: session.position + 1,
    labels: label
      ? [...keptLabels, { afterSeq: state.log.length, text: label }]
      : keptLabels,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Options for a `/play` game (M5d, M5e). `/debug` passes none. */
export interface NewGameOptions {
  /**
   * Human seats confirm every choice, even one with a single option (M5e,
   * `GameState.confirmSingleOption`; M5d had target picks only); bots never do.
   */
  confirmTargets?: boolean;
  /** The First / Second pick; without it 6.3.1.4 picks the first player at random. */
  firstPick?: FirstPick;
  /** Casual (undo allowed) or Tournament (no undo). */
  mode?: MatchMode;
}

/** A new game. */
export function newSession(
  seed: number,
  picked: [DeckOption, DeckOption],
  seats: Record<PlayerId, SeatConfig>,
  { confirmTargets = false, firstPick, mode }: NewGameOptions = {},
): Session {
  const humans = PLAYER_IDS.filter((id) => seats[id].kind === "human");
  const named = picked.map((option) => option.build(seed));
  const decks = PLAYER_IDS.map((id, i) => {
    const deck = named[i] as NamedDeck;
    return { id, monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
  }) as GameRecord["decks"];
  const record: GameRecord = {
    version: 1,
    seed,
    decks,
    actions: [],
    // Illegal decks are allowed, with a warning (Paul's ruling, Oct 21, 2026).
    deckLegality: deckLegalityFor(decks, new Date()),
    seats: { P1: seatRecord(seats.P1), P2: seatRecord(seats.P2) },
    botSeed: `${seed}-bots`,
    ...(confirmTargets && humans.length > 0
      ? { confirmSingleOption: humans }
      : {}),
    ...(firstPick ? { firstPick } : {}),
    ...(mode ? { mode } : {}),
  };
  return {
    record,
    states: [startGame(record)],
    position: 0,
    seats,
    botSeed: `${seed}-bots`,
    labels: [],
  };
}

/** A session from an exported game record (JSON text); throws if it isn't one. */
export function sessionFromRecord(text: string): Session {
  const record = JSON.parse(text) as ExportedRecord;
  if (
    record.version !== 1 ||
    !Array.isArray(record.actions) ||
    !Array.isArray(record.decks)
  ) {
    throw new Error("Not a GojiSim game record");
  }
  const states = replayAll(record);
  const position = Math.min(
    record.position ?? record.actions.length,
    record.actions.length,
  );
  const seats = {
    P1: seatFromRecord(record.seats?.["P1"]),
    P2: seatFromRecord(record.seats?.["P2"]),
  };
  const botSeed = record.botSeed ?? `${record.seed}-bots`;
  return {
    record: {
      version: 1,
      seed: record.seed,
      decks: record.decks,
      actions: record.actions,
      // Records made before deck legality existed get it computed now.
      deckLegality:
        record.deckLegality ?? deckLegalityFor(record.decks, new Date()),
      seats: { P1: seatRecord(seats.P1), P2: seatRecord(seats.P2) },
      botSeed,
      // Replay asks the same choices only with the same option.
      ...(record.confirmSingleTarget
        ? { confirmSingleTarget: record.confirmSingleTarget }
        : {}),
      ...(record.confirmSingleOption
        ? { confirmSingleOption: record.confirmSingleOption }
        : {}),
      ...(record.firstPick ? { firstPick: record.firstPick } : {}),
      ...(record.mode ? { mode: record.mode } : {}),
    },
    states,
    position,
    seats,
    botSeed,
    labels: [],
  };
}

/**
 * Whether `player` may undo now (M5e): a Casual game (records without a mode count as Casual),
 * viewed live, whose last action is `player`'s own and crossed no undo boundary.
 */
export function canUndoSession(session: Session, player: PlayerId): boolean {
  if (session.record.mode === "tournament") return false;
  if (session.position !== session.record.actions.length) return false;
  return canUndo(session.record, session.states, player);
}

/**
 * Takes back the last action (M5e): the record is replayed without it, so the record keeps the
 * final line only. The undo itself is not a game action.
 */
export function undoSession(session: Session): Session {
  const { record, state } = undoLast(session.record);
  const n = record.actions.length;
  return {
    ...session,
    record,
    states: [...session.states.slice(0, n), state],
    position: n,
    labels: session.labels.filter((l) => l.afterSeq < state.log.length),
  };
}

export function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Downloads a session's game record, with the viewer's position. */
export function downloadRecord(session: Session): void {
  const record: ExportedRecord = {
    ...session.record,
    position: session.position,
  };
  downloadJson(record, `gojisim-${record.seed}-${record.actions.length}.json`);
}
