import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { KEEP_BACKUPS, openDb, schemaVersion } from "./db.js";
import { LATEST_VERSION, MIGRATIONS, type Migration } from "./migrations.js";

const quiet = () => {};
const folder = () => mkdtempSync(join(tmpdir(), "gojisim-db-"));
const tables = (db: DatabaseSync) =>
  (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);

/** Made-up migrations for the upgrade tests. */
const steps: Migration[] = [
  { version: 1, name: "a", sql: "CREATE TABLE a (x INTEGER) STRICT;" },
  { version: 2, name: "b", sql: "CREATE TABLE b (y INTEGER) STRICT;" },
  { version: 3, name: "c", sql: "ALTER TABLE a ADD COLUMN z TEXT;" },
];

describe("the database (#150)", () => {
  it("an empty file migrates to the latest version: players, WAL, foreign keys", () => {
    const file = join(folder(), "gojisim.db");
    const db = openDb(file, { log: quiet });
    expect(schemaVersion(db)).toBe(LATEST_VERSION);
    expect(tables(db)).toContain("players");
    expect(
      (db.prepare("PRAGMA journal_mode").get() as { journal_mode: string })
        .journal_mode,
    ).toBe("wal");
    expect(
      (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number })
        .foreign_keys,
    ).toBe(1);
    db.close();
    // Opening again runs nothing and backs nothing up.
    const lines: string[] = [];
    openDb(file, { log: (l) => lines.push(l) }).close();
    expect(lines).toEqual([]);
    expect(existsSync(join(file, "..", "backups"))).toBe(false);
  });

  it("#151: a version-1 file (players only, as #150 shipped) upgrades to games, its players kept", () => {
    const file = join(folder(), "gojisim.db");
    const v1 = openDb(file, { migrations: MIGRATIONS.slice(0, 1), log: quiet });
    v1.prepare(
      "INSERT INTO players (id, discord_id, display_name, avatar_url, created_at, last_seen_at, roles_checked_at) VALUES ('p1', '111', 'Ann', NULL, 1, 1, 1)",
    ).run();
    v1.close();
    const db = openDb(file, { log: quiet });
    expect(schemaVersion(db)).toBe(LATEST_VERSION);
    expect(tables(db)).toEqual(["games", "players"]);
    expect(
      (
        db.prepare("SELECT display_name FROM players").get() as {
          display_name: string;
        }
      ).display_name,
    ).toBe("Ann");
    db.close();
    expect(readdirSync(join(file, "..", "backups"))).toHaveLength(1);
  });

  it("the migrations are numbered 1, 2, 3 … with no gaps", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      MIGRATIONS.map((_, i) => i + 1),
    );
  });

  it("every earlier version upgrades to the latest, backing the file up first", () => {
    for (let from = 1; from < steps.length; from++) {
      const dir = folder();
      const file = join(dir, "gojisim.db");
      openDb(file, { migrations: steps.slice(0, from), log: quiet }).close();
      const lines: string[] = [];
      const db = openDb(file, {
        migrations: steps,
        log: (l) => lines.push(l),
        now: () => Date.UTC(2026, 10, 1, 18, 53, 1),
      });
      expect(schemaVersion(db)).toBe(3);
      expect(tables(db)).toEqual(["a", "b"]);
      db.close();
      expect(readdirSync(join(dir, "backups"))).toEqual([
        `gojisim-${from}-2026-11-01T18-53-01Z.db`,
      ]);
      // The backup is the old version, readable as it was.
      const old = new DatabaseSync(
        join(dir, "backups", `gojisim-${from}-2026-11-01T18-53-01Z.db`),
      );
      expect(schemaVersion(old)).toBe(from);
      old.close();
      expect(lines[0]).toMatch(
        /^GojiSim: backed up the database to .*gojisim-\d-2026-11-01T18-53-01Z\.db before migrating\.$/,
      );
    }
  });

  it("keeps only the last 5 backups", () => {
    const dir = folder();
    const file = join(dir, "gojisim.db");
    openDb(file, { migrations: steps.slice(0, 1), log: quiet }).close();
    // Six older backups already there.
    const backups = join(dir, "backups");
    mkdirSync(backups, { recursive: true });
    for (let d = 1; d <= 6; d++) {
      const name = `gojisim-1-2026-10-0${d}T00-00-00Z.db`;
      writeFileSync(join(backups, name), "");
    }
    openDb(file, {
      migrations: steps,
      log: quiet,
      now: () => Date.UTC(2026, 10, 1),
    }).close();
    const kept = readdirSync(backups).sort();
    expect(kept).toHaveLength(KEEP_BACKUPS);
    expect(kept).toContain("gojisim-1-2026-11-01T00-00-00Z.db");
    expect(kept).not.toContain("gojisim-1-2026-10-01T00-00-00Z.db");
    expect(kept).not.toContain("gojisim-1-2026-10-02T00-00-00Z.db");
  });

  it("a failing migration rolls back, leaves the file at its version, and throws (so the server doesn't start)", () => {
    const file = join(folder(), "gojisim.db");
    openDb(file, { migrations: steps.slice(0, 1), log: quiet }).close();
    const broken: Migration[] = [
      ...steps.slice(0, 1),
      {
        version: 2,
        name: "half",
        sql: "CREATE TABLE b (y INTEGER) STRICT; CREATE TABLE a (x INTEGER);",
      },
    ];
    expect(() => openDb(file, { migrations: broken, log: quiet })).toThrow(
      /Migration 2 \(half\) failed/,
    );
    const db = new DatabaseSync(file);
    expect(schemaVersion(db)).toBe(1);
    expect(tables(db)).toEqual(["a"]);
    db.close();
  });

  it("a file newer than the code refuses to start", () => {
    const file = join(folder(), "gojisim.db");
    openDb(file, { migrations: steps, log: quiet }).close();
    expect(() =>
      openDb(file, { migrations: steps.slice(0, 2), log: quiet }),
    ).toThrow(/schema version 3, newer than this code's 2: refusing to start/);
  });
});
