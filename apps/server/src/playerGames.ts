import type { DatabaseSync } from "node:sqlite";
import { levelName } from "./reports.js";

/**
 * Each player's games in SQLite (#151), so their history and statistics don't scan the record
 * files. A game's row is written on each upload of it; the result comes from the record's
 * `outcome` (the app's summary of the finished game, since the server doesn't run the engine).
 */
export interface GameRow {
  gameId: string;
  file: string;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  /** From the player's side: "win", "loss" or "draw"; `null` while the game goes on. */
  result: "win" | "loss" | "draw" | null;
  botLevel: string | null;
  deckNames: string | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;

/** The human seat (the player's), the bot's level and the deck names, from a record. */
export function gameFacts(record: Json): {
  result: GameRow["result"];
  botLevel: string | null;
  deckNames: string | null;
} {
  const seats = obj(record["seats"]) ?? {};
  const human =
    ["P1", "P2"].find((id) => obj(seats[id])?.["kind"] === "human") ?? null;
  const bot = ["P1", "P2"]
    .map((id) => obj(seats[id]))
    .find((seat) => seat?.["kind"] === "bot");
  const difficulty = obj(bot?.["settings"])?.["difficulty"];
  const outcome = obj(record["outcome"]);
  let result: GameRow["result"] = null;
  if (outcome && human) {
    const winner = outcome["winner"];
    result =
      winner === null
        ? "draw"
        : winner === human
          ? "win"
          : typeof winner === "string"
            ? "loss"
            : null;
  }
  const names = obj(record["deckNames"]);
  const deckNames = names
    ? `${typeof names["P1"] === "string" ? names["P1"] : "Mystery Deck"} vs ${typeof names["P2"] === "string" ? names["P2"] : "Mystery Deck"}`
    : null;
  return {
    result,
    botLevel: typeof difficulty === "number" ? levelName(difficulty) : null,
    deckNames,
  };
}

/** Writes or updates a game's row for its player (the first upload sets the start time). */
export function indexGame(
  db: DatabaseSync,
  game: { gameId: string; playerId: string; file: string; record: Json },
  now: number,
): void {
  const { result, botLevel, deckNames } = gameFacts(game.record);
  db.prepare(
    `INSERT INTO games (game_id, player_id, file, started_at, updated_at, ended_at, result, bot_level, deck_names)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(game_id) DO UPDATE SET
       file = excluded.file,
       updated_at = excluded.updated_at,
       ended_at = COALESCE(games.ended_at, excluded.ended_at),
       result = COALESCE(excluded.result, games.result),
       bot_level = excluded.bot_level,
       deck_names = excluded.deck_names
     WHERE games.player_id = excluded.player_id`,
  ).run(
    game.gameId,
    game.playerId,
    game.file,
    now,
    now,
    result ? now : null,
    result,
    botLevel,
    deckNames,
  );
}

interface Row {
  game_id: string;
  file: string;
  started_at: number;
  updated_at: number;
  ended_at: number | null;
  result: GameRow["result"];
  bot_level: string | null;
  deck_names: string | null;
}

const fromRow = (r: Row): GameRow => ({
  gameId: r.game_id,
  file: r.file,
  startedAt: r.started_at,
  updatedAt: r.updated_at,
  endedAt: r.ended_at,
  result: r.result,
  botLevel: r.bot_level,
  deckNames: r.deck_names,
});

/** A player's games, newest first (at most `limit`). */
export function playerGames(
  db: DatabaseSync,
  playerId: string,
  limit = 200,
): GameRow[] {
  return (
    db
      .prepare(
        "SELECT * FROM games WHERE player_id = ? ORDER BY started_at DESC LIMIT ?",
      )
      .all(playerId, limit) as unknown as Row[]
  ).map(fromRow);
}

/** One of the player's games, or `null` (another player's game is `null` too). */
export function playerGame(
  db: DatabaseSync,
  playerId: string,
  gameId: string,
): GameRow | null {
  const row = db
    .prepare("SELECT * FROM games WHERE player_id = ? AND game_id = ?")
    .get(playerId, gameId) as Row | undefined;
  return row ? fromRow(row) : null;
}
