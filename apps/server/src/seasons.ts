import type { DatabaseSync } from "node:sqlite";

/**
 * Seasons (#153): testing is the "beta" season. At public launch Paul starts a new one
 * (`resetHistory.ts`), and players' history and statistics show only the current season; beta
 * rows and the record files are kept for the metrics.
 */
export const BETA = "beta";

/** The current season: the one started last. */
export function currentSeason(db: DatabaseSync): string {
  const row = db
    .prepare(
      "SELECT name FROM seasons ORDER BY started_at DESC, rowid DESC LIMIT 1",
    )
    .get() as { name: string } | undefined;
  return row?.name ?? BETA;
}

/** A season name Paul can type: lowercase letters, digits and dashes, 2 to 32 long. */
export const validSeason = (name: string) =>
  /^[a-z0-9][a-z0-9-]{1,31}$/.test(name);

/** Starts a new current season; throws for a bad or used name. */
export function startSeason(db: DatabaseSync, name: string, now: number): void {
  if (!validSeason(name))
    throw new Error(
      `"${name}" isn't a season name (a-z, 0-9, dashes; 2 to 32).`,
    );
  const used = db.prepare("SELECT 1 FROM seasons WHERE name = ?").get(name);
  if (used) throw new Error(`Season "${name}" already exists.`);
  db.prepare("INSERT INTO seasons (name, started_at) VALUES (?, ?)").run(
    name,
    now,
  );
}

/** What a reset would leave out of players' history: the counts the dry run prints. */
export function seasonCounts(db: DatabaseSync): {
  season: string;
  players: number;
  games: number;
  playersWithGames: number;
} {
  const season = currentSeason(db);
  const one = (sql: string, ...args: string[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n;
  return {
    season,
    players: one("SELECT COUNT(*) AS n FROM players"),
    games: one("SELECT COUNT(*) AS n FROM games WHERE season = ?", season),
    playersWithGames: one(
      "SELECT COUNT(DISTINCT player_id) AS n FROM games WHERE season = ?",
      season,
    ),
  };
}
