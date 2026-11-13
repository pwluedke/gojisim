import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { GameRecord, SeatId } from "@gojisim/engine";
import { type Room, SEATS, seatOf } from "./room.js";

/** A player's own deck in a head to head game, for their in-app report's Slack post (Paul, Nov 12). */
export interface ReporterDeck {
  name: string;
  deckName: string;
  deck: Pick<GameRecord["decks"][number], "monsterDeck" | "mainDeck">;
}

/**
 * Paul, Nov 12: the reporter's own deck in a head to head game (Q42: never the opponent's), from
 * the room while it's in memory, else from the game's stored record (the `games` row for that
 * player names its file). `null` when neither has it.
 */
export async function reporterDeck(
  rooms: ReadonlyMap<string, Room>,
  db: DatabaseSync | undefined,
  recordsDir: string,
  gameId: string,
  playerId: string,
): Promise<ReporterDeck | null> {
  const room = rooms.get(gameId);
  if (room) {
    const seat = seatOf(room, playerId);
    const player = seat ? room.data.seats[seat] : undefined;
    return player
      ? { name: player.name, deckName: player.deckName, deck: player.deck }
      : null;
  }
  const row = db
    ?.prepare("SELECT file FROM games WHERE game_id = ? AND player_id = ?")
    .get(gameId, playerId) as { file: string } | undefined;
  if (!row) return null;
  try {
    const record = JSON.parse(
      await readFile(join(recordsDir, row.file), "utf8"),
    ) as GameRecord;
    const seat = SEATS.find(
      (s) =>
        (record.seats?.[s] as { playerId?: string } | undefined)?.playerId ===
        playerId,
    ) as SeatId | undefined;
    const deck = seat ? record.decks.find((d) => d.id === seat) : undefined;
    if (!seat || !deck) return null;
    return {
      name:
        (record.seats?.[seat] as { playerName?: string } | undefined)
          ?.playerName ?? "",
      deckName: record.deckNames?.[seat] ?? "",
      deck,
    };
  } catch {
    return null;
  }
}
