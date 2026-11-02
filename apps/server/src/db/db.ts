import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LATEST_VERSION, MIGRATIONS, type Migration } from "./migrations.js";

/**
 * The server's SQLite database (#150), Node's built-in `node:sqlite` (Node 22.13+; it prints one
 * ExperimentalWarning at start). One file on the volume (`/data/gojisim.db`), backed up with it.
 *
 * `openDb` opens it with WAL, foreign keys and a busy timeout, then brings it to `LATEST_VERSION`:
 * - a file newer than this code refuses to start (an old deploy must not write to a newer schema);
 * - with migrations to run, the file is first copied to `<backups>/gojisim-<version>-<time>.db`
 *   (the last `KEEP_BACKUPS` are kept), so a bad migration can be undone by copying it back;
 * - each migration runs in its own transaction with its `user_version`, and a failure rolls back
 *   and throws, which stops the server (Railway keeps the previous deploy).
 */

export const KEEP_BACKUPS = 5;

export interface OpenDbOptions {
  /** Where backups go (default: `backups/` next to the file). */
  backupDir?: string;
  migrations?: readonly Migration[];
  now?: () => number;
  log?: (line: string) => void;
}

/** The file's schema version (`PRAGMA user_version`). */
export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as
    { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

/** A filesystem-safe UTC time: 2026-11-01T18-53-01Z. */
const stamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");

/** The time part of a backup's name, which sorts in time order (an ISO stamp). */
const timeOf = (name: string) =>
  /\d{4}-\d{2}-\d{2}T.*$/.exec(name)?.[0] ?? name;

/**
 * Copies the database (a consistent snapshot, WAL included) to `<dir>/gojisim-<label>-<time>.db`
 * and keeps the newest few. Used before migrations and before a season reset (#153).
 */
export function backupDb(
  db: DatabaseSync,
  dir: string,
  version: number | string,
  now: number,
): string {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `gojisim-${version}-${stamp(now)}.db`);
  // VACUUM INTO writes a clean copy that includes what's still in the WAL file.
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const oldestFirst = readdirSync(dir)
    .filter((name) => /^gojisim-[a-z0-9-]+?-\d{4}-.+\.db$/.test(name))
    .sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
  for (const old of oldestFirst.slice(
    0,
    Math.max(0, oldestFirst.length - KEEP_BACKUPS),
  ))
    rmSync(join(dir, old));
  return target;
}

export function openDb(
  file: string,
  {
    backupDir = join(dirname(file), "backups"),
    migrations = MIGRATIONS,
    now = Date.now,
    log = (line) => console.log(line),
  }: OpenDbOptions = {},
): DatabaseSync {
  const memory = file === ":memory:";
  if (!memory) mkdirSync(dirname(file), { recursive: true });
  const existed = !memory && existsSync(file);
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000");
  if (!memory) db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  const latest = migrations.at(-1)?.version ?? 0;
  const current = schemaVersion(db);
  if (current > latest) {
    db.close();
    throw new Error(
      `${basename(file)} is at schema version ${current}, newer than this code's ${latest}: refusing to start (deploy the newer code, or restore a backup).`,
    );
  }
  const pending = migrations.filter((m) => m.version > current);
  if (pending.length === 0) return db;
  if (existed && current > 0) {
    const copy = backupDb(db, backupDir, current, now());
    log(`GojiSim: backed up the database to ${copy} before migrating.`);
  }
  for (const migration of pending) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${Number(migration.version)}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      db.close();
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    log(
      `GojiSim: database migrated to version ${migration.version} (${migration.name}).`,
    );
  }
  return db;
}

export { LATEST_VERSION };
