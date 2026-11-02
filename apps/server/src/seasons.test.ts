import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db/db.js";
import { MIGRATIONS } from "./db/migrations.js";
import { indexGame, playerGames } from "./playerGames.js";
import { upsertDiscordPlayer } from "./players.js";
import { resetHistory } from "./resetHistory.js";
import { BETA, currentSeason, seasonCounts, startSeason } from "./seasons.js";

const quiet = () => {};
const record = (outcome?: unknown) => ({
  seats: {
    P1: { kind: "human" },
    P2: { kind: "bot", settings: { difficulty: 20 } },
  },
  ...(outcome ? { outcome } : {}),
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "gojisim-season-"));
  const db = openDb(join(dir, "gojisim.db"), { log: quiet });
  const ann = upsertDiscordPlayer(
    db,
    { discordId: "1", displayName: "Ann", avatarUrl: null },
    1,
  );
  return { db, dir, ann };
}

describe("seasons (#153)", () => {
  it("the season is beta until a new one starts; games carry the season they started in", () => {
    const { db, ann } = setup();
    expect(currentSeason(db)).toBe(BETA);
    indexGame(
      db,
      { gameId: "g1", playerId: ann.id, file: "a.json", record: record() },
      10,
    );
    startSeason(db, "launch", 20);
    expect(currentSeason(db)).toBe("launch");
    // The beta game finishing after the reset stays a beta game.
    indexGame(
      db,
      {
        gameId: "g1",
        playerId: ann.id,
        file: "a.json",
        record: record({ winner: "P1", reason: "invasion" }),
      },
      30,
    );
    indexGame(
      db,
      { gameId: "g2", playerId: ann.id, file: "b.json", record: record() },
      40,
    );
    expect(playerGames(db, ann.id).map((g) => g.gameId)).toEqual(["g2"]);
    const seasons = db
      .prepare("SELECT game_id, season FROM games ORDER BY game_id")
      .all();
    expect(seasons).toEqual([
      { game_id: "g1", season: "beta" },
      { game_id: "g2", season: "launch" },
    ]);
  });

  it("a season name is checked and used once", () => {
    const { db } = setup();
    expect(() => startSeason(db, "Launch!", 1)).toThrow(/isn't a season name/);
    expect(() => startSeason(db, "beta", 1)).toThrow(/already exists/);
  });

  it("a version-3 file upgrades: its games become beta games", () => {
    const dir = mkdtempSync(join(tmpdir(), "gojisim-season-"));
    const file = join(dir, "gojisim.db");
    const v3 = openDb(file, { migrations: MIGRATIONS.slice(0, 3), log: quiet });
    const ann = upsertDiscordPlayer(
      v3,
      { discordId: "1", displayName: "Ann", avatarUrl: null },
      1,
    );
    v3.prepare(
      "INSERT INTO games (game_id, player_id, file, started_at, updated_at) VALUES ('old', ?, 'x.json', 1, 1)",
    ).run(ann.id);
    v3.close();
    const db = openDb(file, { log: quiet });
    expect(db.prepare("SELECT season FROM games").get()).toEqual({
      season: "beta",
    });
    expect(playerGames(db, ann.id).map((g) => g.gameId)).toEqual(["old"]);
  });
});

describe("pnpm accounts:reset-history (#153)", () => {
  const io = (answer: string) => {
    const lines: string[] = [];
    return {
      lines,
      io: {
        log: (l: string) => lines.push(l),
        ask: async () => answer,
        now: () => Date.UTC(2026, 11, 1),
      },
    };
  };

  it("a dry run prints the counts and changes nothing", async () => {
    const { db, dir, ann } = setup();
    indexGame(
      db,
      { gameId: "g1", playerId: ann.id, file: "a.json", record: record() },
      10,
    );
    const { lines, io: i } = io("launch");
    expect(
      await resetHistory(
        db,
        join(dir, "backups"),
        { apply: false, season: "launch" },
        i,
      ),
    ).toBe("dry-run");
    expect(lines).toEqual([
      "Current season: beta",
      "Players: 1; 1 with games this season.",
      "Games this season: 1 (kept in the database and the record files; they leave players' history).",
      "Dry run: nothing changed. Run again with --apply --season <name> to start the new season.",
    ]);
    expect(currentSeason(db)).toBe("beta");
  });

  it("the real run asks for the name typed back; a wrong answer changes nothing", async () => {
    const { db, dir } = setup();
    const { lines, io: i } = io("lunch");
    expect(
      await resetHistory(
        db,
        join(dir, "backups"),
        { apply: true, season: "launch" },
        i,
      ),
    ).toBe("cancelled");
    expect(lines.at(-1)).toBe("Not confirmed: nothing changed.");
    expect(currentSeason(db)).toBe("beta");
  });

  it("refuses a bad name or the current season", async () => {
    const { db, dir } = setup();
    for (const season of [undefined, "beta", "No Spaces"])
      expect(
        await resetHistory(
          db,
          join(dir, "backups"),
          { apply: true, season },
          io(season ?? "").io,
        ),
      ).toBe("refused");
  });

  it("confirmed: backs the database up, starts the season, and keeps every beta row", async () => {
    const { db, dir, ann } = setup();
    indexGame(
      db,
      { gameId: "g1", playerId: ann.id, file: "a.json", record: record() },
      10,
    );
    const { lines, io: i } = io("launch");
    expect(
      await resetHistory(
        db,
        join(dir, "backups"),
        { apply: true, season: "launch" },
        i,
      ),
    ).toBe("started");
    expect(readdirSync(join(dir, "backups"))).toEqual([
      "gojisim-before-launch-2026-12-01T00-00-00Z.db",
    ]);
    expect(currentSeason(db)).toBe("launch");
    expect(playerGames(db, ann.id)).toEqual([]);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n,
    ).toBe(1);
    expect(seasonCounts(db)).toMatchObject({
      season: "launch",
      games: 0,
      players: 1,
    });
    expect(lines.at(-1)).toBe(
      "Season launch started. Players' history now shows only games from this season on.",
    );
  });
});
