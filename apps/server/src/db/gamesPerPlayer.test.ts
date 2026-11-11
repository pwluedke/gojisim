import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { indexGame, indexH2hGame, playerGames } from "../playerGames.js";
import { seasonCounts } from "../seasons.js";
import { openDb, schemaVersion } from "./db.js";
import { MIGRATIONS } from "./migrations.js";

/*
 * M9a, migration 5 ("games per player"): `games` keyed by (game_id, player_id). This runs on the
 * production database at the first deploy after M9a, so it is tested on a file at today's
 * schema (version 4, as deployed) holding rows of every kind the live table has.
 */

const quiet = () => {};
const TODAY = MIGRATIONS.filter((m) => m.version <= 4);

/** A version-4 file, made the way production's was (migrations 1 to 4), with rows. */
function todaysFile(): { file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "gojisim-m5-"));
  const file = join(dir, "gojisim.db");
  const db = openDb(file, { migrations: TODAY, log: quiet });
  db.exec(`
    INSERT INTO players (id, discord_id, display_name, avatar_url, created_at, last_seen_at, roles_checked_at)
      VALUES ('p1', 'd1', 'Player One', NULL, 1, 2, 3), ('p2', 'd2', 'Player Two', 'x', 4, 5, NULL);
    INSERT INTO seasons (name, started_at) VALUES ('launch', 100);
    INSERT INTO games (game_id, player_id, file, started_at, updated_at, ended_at, result, bot_level, deck_names, season)
      VALUES
        ('g-finished', 'p1', '2026-11-01/g-finished.json', 10, 20, 20, 'win', 'Hard', 'A vs B', 'beta'),
        ('g-open', 'p1', '2026-11-02/g-open.json', 30, 31, NULL, NULL, 'Easy', NULL, 'launch'),
        ('g-other', 'p2', '2026-11-02/g-other.json', 40, 41, 41, 'loss', NULL, 'C vs D', 'launch');
  `);
  db.close();
  return { file, dir };
}

const rows = (db: DatabaseSync) =>
  db
    .prepare(
      "SELECT game_id, player_id, file, started_at, updated_at, ended_at, result, bot_level, deck_names, season, h2h FROM games ORDER BY game_id",
    )
    .all();

describe("migration 5, games per player (M9a)", () => {
  it("today's file upgrades with every row and value kept, a backup first, and the season index made again", () => {
    const { file, dir } = todaysFile();
    const before = new DatabaseSync(file);
    expect(schemaVersion(before)).toBe(4);
    const old = before
      .prepare("SELECT * FROM games ORDER BY game_id")
      .all() as Record<string, unknown>[];
    before.close();

    const lines: string[] = [];
    const db = openDb(file, { log: (line) => lines.push(line) });
    expect(schemaVersion(db)).toBe(5);
    expect(lines.some((l) => l.includes("backed up the database"))).toBe(true);
    expect(readdirSync(join(dir, "backups")).length).toBe(1);
    expect(rows(db)).toEqual(old.map((row) => ({ ...row, h2h: 0 })));
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'games'",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(indexes).toContain("games_by_player_season");
    // The players, decks and seasons are untouched.
    expect(db.prepare("SELECT COUNT(*) AS n FROM players").get()).toEqual({
      n: 2,
    });
    expect(
      db.prepare("SELECT name FROM seasons ORDER BY started_at").all(),
    ).toEqual([{ name: "beta" }, { name: "launch" }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    db.close();
  });

  it("after it, uploads still update their own row, and a head to head game gets one row per player", () => {
    const { file } = todaysFile();
    const db = openDb(file, { log: quiet });
    indexGame(
      db,
      {
        gameId: "g-open",
        playerId: "p1",
        file: "2026-11-02/g-open.json",
        record: {
          seats: { P1: { kind: "human" } },
          outcome: { winner: "P1", reason: "invasion" },
        },
      },
      50,
    );
    expect(
      db
        .prepare("SELECT result, ended_at FROM games WHERE game_id = 'g-open'")
        .get(),
    ).toEqual({
      result: "win",
      ended_at: 50,
    });
    indexH2hGame(
      db,
      {
        gameId: "g-h2h",
        file: "2026-11-11/g-h2h.json",
        players: { P1: "p1", P2: "p2" },
        winner: "P2",
        abandoned: false,
        deckNames: "A vs C",
        startedAt: 60,
      },
      70,
    );
    expect(
      db
        .prepare(
          "SELECT player_id, result, h2h FROM games WHERE game_id = 'g-h2h' ORDER BY player_id",
        )
        .all(),
    ).toEqual([
      { player_id: "p1", result: "loss", h2h: 1 },
      { player_id: "p2", result: "win", h2h: 1 },
    ]);
    // An upload with a head to head game's id never changes its rows.
    indexGame(
      db,
      {
        gameId: "g-h2h",
        playerId: "p1",
        file: "x.json",
        record: { outcome: { winner: "P1", reason: "x" } },
      },
      80,
    );
    expect(
      db
        .prepare(
          "SELECT file, result FROM games WHERE game_id = 'g-h2h' AND player_id = 'p1'",
        )
        .get(),
    ).toEqual({
      file: "2026-11-11/g-h2h.json",
      result: "loss",
    });
    // Both players see it in My games (the launch season is current).
    expect(playerGames(db, "p2").map((g) => g.gameId)).toEqual([
      "g-h2h",
      "g-other",
    ]);
    db.close();
  });

  it("an abandoned head to head game has no result for either player", () => {
    const db = openDb(":memory:", { log: quiet });
    db.exec(
      "INSERT INTO players (id, display_name, created_at, last_seen_at) VALUES ('p1', 'A', 0, 0), ('p2', 'B', 0, 0)",
    );
    indexH2hGame(
      db,
      {
        gameId: "g",
        file: "d/g.json",
        players: { P1: "p1", P2: "p2" },
        winner: null,
        abandoned: true,
        deckNames: "A vs B",
        startedAt: 0,
      },
      1,
    );
    expect(db.prepare("SELECT result, ended_at FROM games").all()).toEqual([
      { result: null, ended_at: 1 },
      { result: null, ended_at: 1 },
    ]);
    // The season counts count a game once, though it has a row per player.
    expect(seasonCounts(db)).toMatchObject({ games: 1, playersWithGames: 2 });
  });
});
