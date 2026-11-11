import type { GameRecord, SeatId } from "@gojisim/engine";
import {
  actionsFor,
  historyBoard,
  type Room,
  roomFromData,
  SEATS,
  type SeatMessage,
  type SeatPlayer,
  seatMessage,
} from "./room.js";

/*
 * Replaying a finished head to head game from My games (M9c, Monarch): built like the live
 * history view. The record file never leaves the server (it holds both decks and their order,
 * Q42); a player gets their own seat's message for the end of the game, the actions as they may
 * know them, and their own board after any action on request.
 */

/** A finished game's record as a room again (closed, nobody connected), to reuse the seat views. */
export function replayRoom(record: GameRecord): Room {
  const seats: Partial<Record<SeatId, SeatPlayer>> = {};
  for (const seat of SEATS) {
    const recorded = record.seats?.[seat];
    const deck = record.decks.find((d) => d.id === seat);
    if (recorded?.kind !== "human" || !recorded.playerId || !deck)
      throw new Error(`Not a head to head record (seat ${seat})`);
    seats[seat] = {
      playerId: recorded.playerId,
      name: recorded.playerName ?? seat,
      deckName: record.deckNames?.[seat] ?? "Mystery Deck",
      deck: { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck },
    };
  }
  return roomFromData(
    {
      version: 1,
      gameId: record.gameId ?? "",
      createdAt: 0,
      mode: record.mode ?? "casual",
      seed: Number(record.seed),
      seats,
      picker: (record.firstPick?.player as SeatId | undefined) ?? null,
      record,
      batches: [],
      undoAsk: null,
      // A replay is a game that is over: the opponent's deck name shows, no move is legal.
      endedAt: 1,
    },
    0,
  );
}

/** The seat a player had in the game, or `null` (not theirs). */
export function replaySeat(room: Room, playerId: string): SeatId | null {
  return SEATS.find((s) => room.data.seats[s]?.playerId === playerId) ?? null;
}

/** The start of a replay: the seat's message for the end, and every action as the seat knew it. */
export function replayStart(
  room: Room,
  seat: SeatId,
): { message: SeatMessage; actions: ReturnType<typeof actionsFor> } {
  return {
    message: seatMessage(room, seat, 0),
    actions: actionsFor(room, seat),
  };
}

export { historyBoard as replayBoard };

/** The last few replayed games, so stepping through one doesn't replay it for every board. */
export function replayCache(size = 4) {
  const rooms = new Map<string, Room>();
  return (gameId: string, load: () => Room): Room => {
    const found = rooms.get(gameId);
    if (found) {
      rooms.delete(gameId);
      rooms.set(gameId, found);
      return found;
    }
    const room = load();
    rooms.set(gameId, room);
    for (const old of rooms.keys()) {
      if (rooms.size <= size) break;
      rooms.delete(old);
    }
    return room;
  };
}
