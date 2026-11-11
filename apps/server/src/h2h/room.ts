import { isDeepStrictEqual } from "node:util";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type BoardModel,
  boardModel,
  canUndo,
  deckLegalityFor,
  type GameRecord,
  type GameState,
  getLegalActions,
  type MatchMode,
  type PlayerSetup,
  replayAll,
  type SeatId,
  startGame,
  type UndoEntry,
} from "@gojisim/engine";
import { firstPicker } from "./firstPick.js";

/*
 * A head to head game (M9a): two signed-in players, the engine on the server. This module is the
 * game's rules for the room (who may do what, and when); `socket.ts` carries the messages. It
 * changes the room in place and never sends anything: the caller sends each seat its
 * `seatMessage`, built from that seat's `getPlayerView`, so a hand, the deck order or the seed
 * never reach the other player.
 */

export const SEATS = ["P1", "P2"] as const;
/** A player gone this long lets the other claim the win (Paul: 5 minutes). */
export const CLAIM_AFTER_MS = 5 * 60_000;
/** Both players gone this long: the game is abandoned (no winner, the record is kept). */
export const ABANDON_AFTER_MS = 30 * 60_000;
/** A finished room stays this long for the game-over screen and the history view. */
export const KEEP_FINISHED_MS = 10 * 60_000;
/** The most choices one confirmed multi-card pick may send (a whole hand is far fewer). */
export const MAX_BATCH = 60;

export type Phase = "waiting" | "picking" | "playing" | "over";

/** A player in a seat, with the deck they picked. */
export interface SeatPlayer {
  playerId: string;
  name: string;
  deckName: string;
  deck: Pick<PlayerSetup, "monsterDeck" | "mainDeck">;
}

/** What is saved to disk after every change, so a restart can rebuild the room (`store.ts`). */
export interface RoomData {
  version: 1;
  gameId: string;
  createdAt: number;
  mode: MatchMode;
  seed: number;
  seats: Partial<Record<SeatId, SeatPlayer>>;
  /** Who makes the First / Second pick, once both have joined. */
  picker: SeatId | null;
  /** The game record, from the First / Second pick on. */
  record: GameRecord | null;
  /** Confirmed multi-card picks (actions `start` to `end - 1`), undone together. */
  batches: { start: number; end: number }[];
  /** A Casual undo waiting for the other player's answer: who asked. */
  undoAsk: SeatId | null;
  /** When the game ended (a result, a claim or an abandon). */
  endedAt: number | null;
}

export interface Presence {
  connected: boolean;
  /** When `connected` last changed. */
  since: number;
}

export interface Room {
  data: RoomData;
  /** `states[i]` is the state after `i` actions (empty before the pick). */
  states: GameState[];
  presence: Record<SeatId, Presence>;
}

export type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export const otherSeat = (seat: SeatId): SeatId =>
  seat === "P1" ? "P2" : "P1";

export function createRoom({
  gameId,
  seed,
  mode,
  creator,
  now,
}: {
  gameId: string;
  seed: number;
  mode: MatchMode;
  creator: SeatPlayer;
  now: number;
}): Room {
  return {
    data: {
      version: 1,
      gameId,
      createdAt: now,
      mode,
      seed,
      seats: { P1: creator },
      picker: null,
      record: null,
      batches: [],
      undoAsk: null,
      endedAt: null,
    },
    states: [],
    presence: {
      P1: { connected: false, since: now },
      P2: { connected: false, since: now },
    },
  };
}

/** A room from its saved data (after a restart): the states replayed, nobody connected yet. */
export function roomFromData(data: RoomData, now: number): Room {
  return {
    data,
    states: data.record ? replayAll(data.record) : [],
    presence: {
      P1: { connected: false, since: now },
      P2: { connected: false, since: now },
    },
  };
}

export function phaseOf(room: Room): Phase {
  if (room.data.endedAt !== null) return "over";
  if (!room.data.seats.P2) return "waiting";
  if (!room.data.record) return "picking";
  return "playing";
}

export function seatOf(room: Room, playerId: string): SeatId | null {
  return SEATS.find((s) => room.data.seats[s]?.playerId === playerId) ?? null;
}

const current = (room: Room) => room.states[room.states.length - 1];

/** The second player takes P2; the server then picks who makes the First / Second pick. */
export function joinRoom(
  room: Room,
  player: SeatPlayer,
  pickFirst: () => SeatId = firstPicker,
): Result {
  if (seatOf(room, player.playerId)) return ok;
  if (phaseOf(room) !== "waiting") return fail("full");
  room.data.seats.P2 = player;
  room.data.picker = pickFirst();
  return ok;
}

export function setConnected(
  room: Room,
  seat: SeatId,
  connected: boolean,
  now: number,
): void {
  if (room.presence[seat].connected !== connected)
    room.presence[seat] = { connected, since: now };
}

/** How long `seat` has been gone, or 0 while connected. */
export function goneFor(room: Room, seat: SeatId, now: number): number {
  const p = room.presence[seat];
  return p.connected ? 0 : now - p.since;
}

/** The picker picks one of the two face-down cards (6.3.1.4); the game starts. */
export function pickFirst(room: Room, seat: SeatId, card: 0 | 1): Result {
  if (phaseOf(room) !== "picking") return fail("not-picking");
  if (room.data.picker !== seat) return fail("not-your-pick");
  const { P1, P2 } = room.data.seats as Record<SeatId, SeatPlayer>;
  const decks: GameRecord["decks"] = [
    { id: "P1", ...P1.deck },
    { id: "P2", ...P2.deck },
  ];
  const record: GameRecord = {
    version: 1,
    seed: room.data.seed,
    decks,
    actions: [],
    gameId: room.data.gameId,
    h2h: true,
    deckLegality: deckLegalityFor(decks, new Date(room.data.createdAt)),
    seats: {
      P1: { kind: "human", playerId: P1.playerId, playerName: P1.name },
      P2: { kind: "human", playerId: P2.playerId, playerName: P2.name },
    },
    // As in `/play`, every choice is asked, even with one option, so you see what an effect hits.
    confirmSingleOption: ["P1", "P2"],
    firstPick: { player: seat, card },
    mode: room.data.mode,
    deckNames: { P1: P1.deckName, P2: P2.deckName },
  };
  room.data.record = record;
  room.states = [startGame(record)];
  return ok;
}

function finish(room: Room, now: number): void {
  const record = room.data.record as GameRecord;
  const result = current(room)?.result;
  room.data.endedAt = now;
  room.data.undoAsk = null;
  if (result) record.outcome = { winner: result.winner, reason: result.reason };
}

function apply(room: Room, action: Action): void {
  const record = room.data.record as GameRecord;
  const state = current(room) as GameState;
  room.states.push(advanceToDecision(applyAction(state, action)));
  record.actions.push(action);
}

/** After a move: an open undo request is answered no (the asker's action is no longer last). */
function moved(room: Room, start: number, now: number): void {
  const end = (room.data.record as GameRecord).actions.length;
  room.data.batches = room.data.batches.filter((b) => b.end <= start);
  if (end - start > 1) room.data.batches.push({ start, end });
  room.data.undoAsk = null;
  if (current(room)?.result) finish(room, now);
}

/**
 * `seat`'s move. `seq` is the number of actions the client saw, so a doubled or stale click is
 * refused. The action must equal one of `getLegalActions` for the seat; the server applies its
 * own copy, never the client's object.
 */
export function act(
  room: Room,
  seat: SeatId,
  seq: number,
  action: unknown,
  now: number,
): Result {
  if (phaseOf(room) !== "playing") return fail("not-playing");
  const record = room.data.record as GameRecord;
  if (seq !== record.actions.length) return fail("stale");
  const legal = getLegalActions(current(room) as GameState, seat).find((a) =>
    isDeepStrictEqual(a, action),
  );
  if (!legal) return fail("illegal");
  const start = record.actions.length;
  apply(room, legal);
  moved(room, start, now);
  return ok;
}

/**
 * A confirmed multi-card pick (as `/play`'s `withChoices`): one `choose` per option id, in pick
 * order, each answering the choice open at that moment (every card is its own engine choice),
 * then Done when `done` is set. A pick the engine no longer offers stops the batch; the first
 * must be legal. The actions are one batch for undo.
 */
export function pickCards(
  room: Room,
  seat: SeatId,
  seq: number,
  optionIds: unknown,
  done: boolean,
  now: number,
): Result {
  if (phaseOf(room) !== "playing") return fail("not-playing");
  const record = room.data.record as GameRecord;
  if (seq !== record.actions.length) return fail("stale");
  if (
    !Array.isArray(optionIds) ||
    optionIds.length > MAX_BATCH ||
    !optionIds.every((id) => typeof id === "string")
  )
    return fail("bad-pick");
  const start = record.actions.length;
  const pick = (optionId: string): boolean => {
    const choice = (current(room) as GameState).pendingChoice;
    if (
      !choice ||
      choice.player !== seat ||
      !choice.options.some((o) => o.id === optionId)
    )
      return false;
    apply(room, {
      type: "choose",
      player: seat,
      choiceId: choice.id,
      optionId,
    });
    return true;
  };
  for (const id of optionIds as string[]) if (!pick(id)) break;
  if (done) pick("done");
  if (record.actions.length === start) return fail("illegal");
  moved(room, start, now);
  return ok;
}

/** 1.2.3: either player may concede at any time while the game runs. */
export function concede(room: Room, seat: SeatId, now: number): Result {
  if (phaseOf(room) !== "playing") return fail("not-playing");
  const record = room.data.record as GameRecord;
  return act(
    room,
    seat,
    record.actions.length,
    { type: "concede", player: seat },
    now,
  );
}

/** Whether `seat` may ask to undo: a Casual game whose last action is theirs and undoable. */
export function canAskUndo(room: Room, seat: SeatId): boolean {
  const record = room.data.record;
  if (phaseOf(room) !== "playing" || !record) return false;
  if (room.data.mode === "tournament" || room.data.undoAsk) return false;
  return canUndo(record, room.states, seat);
}

/** Casual only: `seat` asks to take back their last action; the other player answers. */
export function askUndo(room: Room, seat: SeatId): Result {
  if (!canAskUndo(room, seat)) return fail("no-undo");
  room.data.undoAsk = seat;
  return ok;
}

function undoOnce(room: Room, now: number): void {
  const record = room.data.record as GameRecord;
  const n = record.actions.length - 1;
  const action = record.actions[n] as Action;
  // Kept as information, as in `/play`'s undo (M5h #10); the label is the action's kind, since
  // the server has no log wording (the record still has the whole action).
  const entry: UndoEntry = {
    player: action.player,
    at: new Date(now).toISOString(),
    index: n,
    action,
    label: action.type,
  };
  room.data.record = {
    ...record,
    actions: record.actions.slice(0, n),
    undos: [...(record.undos ?? []), entry],
    undoCount: {
      ...record.undoCount,
      [action.player]: (record.undoCount?.[action.player] ?? 0) + 1,
    },
  };
  room.states = room.states.slice(0, n + 1);
}

/**
 * The other player answers an undo request. Yes takes back the asker's last action, or the whole
 * confirmed pick it ended, as far as Casual undo may go (the same scope as `/play`'s undo).
 */
export function answerUndo(
  room: Room,
  seat: SeatId,
  accept: boolean,
  now: number,
): Result {
  const asker = room.data.undoAsk;
  if (phaseOf(room) !== "playing" || asker !== otherSeat(seat))
    return fail("no-undo-asked");
  room.data.undoAsk = null;
  if (!accept) return ok;
  const record = room.data.record as GameRecord;
  if (!canUndo(record, room.states, asker)) return fail("no-undo");
  const batch = room.data.batches.find((b) => b.end === record.actions.length);
  undoOnce(room, now);
  while (
    batch &&
    (room.data.record as GameRecord).actions.length > batch.start &&
    canUndo(room.data.record as GameRecord, room.states, asker)
  )
    undoOnce(room, now);
  const left = (room.data.record as GameRecord).actions.length;
  room.data.batches = room.data.batches.filter((b) => b.end <= left);
  return ok;
}

/** Whether `seat` may claim the win: the other player has been gone 5 minutes mid-game. */
export function canClaim(room: Room, seat: SeatId, now: number): boolean {
  return (
    phaseOf(room) === "playing" &&
    room.presence[seat].connected &&
    goneFor(room, otherSeat(seat), now) >= CLAIM_AFTER_MS
  );
}

/** The win by claim: the record ends with the gone player's concede (1.2.3), so it replays. */
export function claimWin(room: Room, seat: SeatId, now: number): Result {
  if (!canClaim(room, seat, now)) return fail("no-claim");
  const gone = otherSeat(seat);
  const record = room.data.record as GameRecord;
  const result = act(
    room,
    gone,
    record.actions.length,
    { type: "concede", player: gone },
    now,
  );
  if (result.ok) (room.data.record as GameRecord).h2hEnd = "claimed";
  return result;
}

/**
 * What the sweep does with a room now: `"abandon"` a game both players left 30 minutes ago
 * (`abandon` ends it), `"drop"` a finished room after 10 minutes or a game that never started
 * once everyone in it has been gone 30 minutes, else `null`.
 */
export function sweepVerdict(
  room: Room,
  now: number,
): "abandon" | "drop" | null {
  const phase = phaseOf(room);
  if (phase === "over")
    return now - (room.data.endedAt as number) >= KEEP_FINISHED_MS
      ? "drop"
      : null;
  const seated = SEATS.filter((s) => room.data.seats[s]);
  const allGone = seated.every(
    (s) => goneFor(room, s, now) >= ABANDON_AFTER_MS,
  );
  if (!allGone) return null;
  return phase === "playing" ? "abandon" : "drop";
}

/** Ends a game both players left: no winner; the record is kept, unfinished. */
export function abandon(room: Room, now: number): void {
  const record = room.data.record as GameRecord;
  record.h2hEnd = "abandoned";
  record.outcome = { winner: null, reason: "abandoned" };
  room.data.endedAt = now;
  room.data.undoAsk = null;
}

/** What one seat is sent after every change: only what that seat may see. */
export interface SeatMessage {
  gameId: string;
  phase: Phase;
  you: SeatId;
  mode: MatchMode;
  /** Who makes the First / Second pick (from the moment both have joined). */
  picker: SeatId | null;
  opponent: {
    name: string;
    connected: boolean;
    /** How long they have been gone, in ms (0 while connected). */
    goneMs: number;
    /** Their deck's name: `null` (shown as Mystery deck) until the game is over. */
    deckName: string | null;
  } | null;
  /** Actions so far: the `seq` the next move must carry. */
  seq: number;
  /** This seat's board (`boardModel`), from the pick on. */
  model: BoardModel | null;
  /** This seat's legal actions now (`getLegalActions`); empty when it isn't their move. */
  legal: Action[];
  undo: { asked: SeatId | null; canAsk: boolean };
  canClaim: boolean;
  outcome: GameRecord["outcome"] | null;
  h2hEnd: GameRecord["h2hEnd"] | null;
}

export function seatMessage(
  room: Room,
  seat: SeatId,
  now: number,
): SeatMessage {
  const other = otherSeat(seat);
  const opponent = room.data.seats[other];
  const state = current(room);
  const phase = phaseOf(room);
  const record = room.data.record;
  return {
    gameId: room.data.gameId,
    phase,
    you: seat,
    mode: room.data.mode,
    picker: room.data.picker,
    opponent: opponent
      ? {
          name: opponent.name,
          connected: room.presence[other].connected,
          goneMs: goneFor(room, other, now),
          deckName: phase === "over" ? opponent.deckName : null,
        }
      : null,
    seq: record?.actions.length ?? 0,
    model: state ? boardModel(state, seat) : null,
    legal: state && phase === "playing" ? getLegalActions(state, seat) : [],
    undo: { asked: room.data.undoAsk, canAsk: canAskUndo(room, seat) },
    canClaim: canClaim(room, seat, now),
    outcome: record?.outcome ?? null,
    h2hEnd: record?.h2hEnd ?? null,
  };
}

/** The history view: `seat`'s board after `index` actions, only what the seat could see then. */
export function historyBoard(
  room: Room,
  seat: SeatId,
  index: number,
): BoardModel | null {
  const state = Number.isSafeInteger(index) ? room.states[index] : undefined;
  return state ? boardModel(state, seat) : null;
}
