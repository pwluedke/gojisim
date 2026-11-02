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
  {
    version: 3,
    name: "player decks and settings",
    // #152: My decks and Settings follow the player. A deleted deck stays as a tombstone, so the
    // other browsers drop it too. Times are the client's ISO edit times (the newest edit wins).
    sql: `
      CREATE TABLE player_decks (
        player_id TEXT NOT NULL REFERENCES players(id),
        deck_id TEXT NOT NULL,
        name TEXT NOT NULL,
        list TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (player_id, deck_id)
      ) STRICT;
      CREATE TABLE player_settings (
        player_id TEXT PRIMARY KEY REFERENCES players(id),
        settings TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 4,
    name: "seasons",
    // #153: every game belongs to a season. Testing is "beta"; at public launch Paul starts a
    // new season (`pnpm accounts:reset-history`), and history shows only the current one. Beta
    // rows stay for the metrics. The current season is the one started last.
    sql: `
      CREATE TABLE seasons (
        name TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL
      ) STRICT;
      INSERT INTO seasons (name, started_at) VALUES ('beta', 0);
      ALTER TABLE games ADD COLUMN season TEXT NOT NULL DEFAULT 'beta';
      DROP INDEX games_by_player;
      CREATE INDEX games_by_player_season ON games (player_id, season, started_at DESC);
    `,
  },
];

/** The schema version this code expects: the last migration's. */
export const LATEST_VERSION = MIGRATIONS.at(-1)?.version ?? 0;
