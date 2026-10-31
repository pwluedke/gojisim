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
  type PlayerState,
  replayAll,
  startGame,
  type UndoEntry,
  undoLast,
} from "@gojisim/engine";
import { type SeatConfig, seatFromRecord, seatRecord } from "./bots";
import { actionLabel } from "./labels";
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
  /**
   * Confirmed multi-card picks (Tester fixes 1): actions `start` to `end - 1` were one Confirm,
   * so an undo takes them back together. Not in the record (replay never needs it).
   */
  batches?: { start: number; end: number }[];
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
    // Batches past the position belong to the dropped actions.
    batches: (session.batches ?? []).filter((b) => b.end <= session.position),
  };
}

/**
 * Confirms a multi-card pick (Tester fixes 1): one `choose` per selected card, in selection order,
 * then Done when `done` is set (fewer cards than the pick's maximum, where it may stop). The
 * engine is unchanged: it still takes one card per choice. A pick it no longer offers stops the
 * batch. The actions are one batch for undo.
 */
export function withChoices(
  session: Session,
  player: PlayerId,
  optionIds: readonly string[],
  done: boolean,
): Session {
  const start = session.position;
  let current = session;
  const pick = (optionId: string): boolean => {
    const choice = (current.states[current.position] as GameState)
      .pendingChoice;
    if (
      !choice ||
      choice.player !== player ||
      !choice.options.some((o) => o.id === optionId)
    )
      return false;
    current = withAction(current, {
      type: "choose",
      player,
      choiceId: choice.id,
      optionId,
    });
    return true;
  };
  for (const id of optionIds) if (!pick(id)) break;
  if (done) pick("done");
  const end = current.position;
  const kept = (current.batches ?? []).filter((b) => b.end <= start);
  return end - start > 1
    ? { ...current, batches: [...kept, { start, end }] }
    : { ...current, batches: kept };
}

/**
 * Casual undo from the UI (M5e, Tester fixes 1): the last action, or the whole confirmed
 * multi-card pick it ended, as far as undo may go.
 */
export function undoConfirmed(session: Session, player: PlayerId): Session {
  const n = session.record.actions.length;
  const batch = session.batches?.find((b) => b.end === n);
  let current = undoSession(session);
  while (
    batch &&
    current.record.actions.length > batch.start &&
    canUndoSession(current, player)
  )
    current = undoSession(current);
  const left = current.record.actions.length;
  return {
    ...current,
    batches: (current.batches ?? []).filter((b) => b.end <= left),
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
  /** The human sees the bot's hand (M5h #13); the record flags the game. */
  showOpponentHand?: boolean;
  /** The human peeked at the First / Second cards (Casual); the record flags the game. */
  firstPickPeeked?: boolean;
}

/** A new game. */
export function newSession(
  seed: number,
  picked: [DeckOption, DeckOption],
  seats: Record<PlayerId, SeatConfig>,
  {
    confirmTargets = false,
    firstPick,
    mode,
    showOpponentHand = false,
    firstPickPeeked = false,
  }: NewGameOptions = {},
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
    gameId: crypto.randomUUID(),
    // Illegal decks are allowed, with a warning (Paul's ruling, Oct 21, 2026).
    deckLegality: deckLegalityFor(decks, new Date()),
    seats: { P1: seatRecord(seats.P1), P2: seatRecord(seats.P2) },
    botSeed: `${seed}-bots`,
    ...(confirmTargets && humans.length > 0
      ? { confirmSingleOption: humans }
      : {}),
    ...(firstPick ? { firstPick } : {}),
    ...(mode ? { mode } : {}),
    ...(showOpponentHand
      ? {
          showOpponentHand,
          showOpponentHandAt: 0,
          excludedFromAchievements: true,
        }
      : {}),
    ...(firstPickPeeked ? { firstPickPeeked } : {}),
    deckNames: { P1: picked[0].label, P2: picked[1].label },
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
      ...(record.showOpponentHand ? { showOpponentHand: true } : {}),
      ...(record.showOpponentHandAt !== undefined
        ? { showOpponentHandAt: record.showOpponentHandAt }
        : {}),
      ...(record.excludedFromAchievements
        ? { excludedFromAchievements: true }
        : {}),
      // A record from before game ids gets one now, so its uploads become one file too.
      gameId: record.gameId ?? crypto.randomUUID(),
      ...(record.botFeedback ? { botFeedback: record.botFeedback } : {}),
      ...(record.bugReports ? { bugReports: record.bugReports } : {}),
      ...(record.ideas ? { ideas: record.ideas } : {}),
      ...(record.crash ? { crash: record.crash } : {}),
      ...(record.firstPickPeeked ? { firstPickPeeked: true } : {}),
      ...(record.undos ? { undos: record.undos } : {}),
      ...(record.undoCount ? { undoCount: record.undoCount } : {}),
      ...(record.deckNames ? { deckNames: record.deckNames } : {}),
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
  const { record: shorter, state } = undoLast(session.record);
  const n = shorter.actions.length;
  // M5h #10: the undo is kept as information (replay never reads it), with a count per player.
  const action = session.record.actions[n] as Action;
  const undo: UndoEntry = {
    player: action.player,
    at: new Date().toISOString(),
    index: n,
    action,
    label: actionLabel(session.states[n] as GameState, action),
  };
  const record: GameRecord = {
    ...shorter,
    undos: [...(shorter.undos ?? []), undo],
    undoCount: {
      ...shorter.undoCount,
      [action.player]: (shorter.undoCount?.[action.player] ?? 0) + 1,
    },
  };
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

/**
 * The board as it stands at the First / Second pick (6.3.1.4): both decks shuffled in place
 * (6.3.1.3), no hands and no invading monsters yet (6.3.1.5, 6.3.1.6), an empty log and no
 * pending choice, so nothing on the board tells who goes first. Display only, under the pick
 * modal: the game starts from the picked card's own session. The decks are the same whichever card is picked (they are
 * shuffled before the pick's RNG draw, decision 48).
 */
export function prePickSession(session: Session): Session {
  const start = session.states[0] as GameState;
  const state: GameState = {
    ...start,
    log: [],
    // The first game's opening decision (a start-of-turn ability) would say who goes first.
    pendingChoice: null,
    resolution: null,
    revealed: [],
    players: start.players.map((player): PlayerState => ({
      ...player,
      deck: [...player.hand, ...player.deck],
      hand: [],
      monsterDeck: [...player.invadingMonsterZone, ...player.monsterDeck],
      invadingMonsterZone: [],
      monsterPosition: null,
    })) as GameState["players"],
  };
  return {
    ...session,
    record: { ...session.record, actions: [] },
    states: [state],
    position: 0,
  };
}
