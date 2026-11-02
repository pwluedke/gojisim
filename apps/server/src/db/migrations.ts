/**
 * The database's versioned migrations (#150). Each runs once, in order, in its own transaction,
 * and `PRAGMA user_version` records the last one applied (`openDb`). An applied migration is
 * never edited: a change is a new migration at the end.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "players",
    // A player is a Discord account. No email is stored. Times are ms since the epoch.
    sql: `
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        discord_id TEXT UNIQUE,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        roles_checked_at INTEGER
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: "games",
    // #151: each player's games, so history and statistics don't scan the record files. The
    // file is the record's path under the records folder; the result is from the player's side.
    sql: `
      CREATE TABLE games (
        game_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        file TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ended_at INTEGER,
        result TEXT,
        bot_level TEXT,
        deck_names TEXT
      ) STRICT;
      CREATE INDEX games_by_player ON games (player_id, started_at DESC);
    `,
  },
];

/** The schema version this code expects: the last migration's. */
export const LATEST_VERSION = MIGRATIONS.at(-1)?.version ?? 0;
