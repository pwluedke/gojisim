import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import { backupDb, openDb } from "./db/db.js";
import { seasonCounts, startSeason, validSeason } from "./seasons.js";

/**
 * `pnpm accounts:reset-history` (#153): starts a new season at public launch, so players'
 * history and statistics show only games from then on. Nothing is deleted: beta games stay in
 * the database and the record files stay on the volume, for the metrics.
 *
 * Paul runs it on Railway (`railway ssh`, then `node apps/server/dist/resetHistory.js …`):
 * - with no `--apply` it's a dry run: the current season and what the reset would leave out;
 * - `--apply --season <name>` backs the database up, asks Paul to type the season's name, and
 *   starts it. The running server sees the new season on its next request.
 */
export interface ResetIo {
  log: (line: string) => void;
  ask: (question: string) => Promise<string>;
  now: () => number;
}

export async function resetHistory(
  db: DatabaseSync,
  backupDir: string,
  options: { apply: boolean; season: string | undefined },
  io: ResetIo,
): Promise<"dry-run" | "started" | "cancelled" | "refused"> {
  const counts = seasonCounts(db);
  io.log(`Current season: ${counts.season}`);
  io.log(
    `Players: ${counts.players}; ${counts.playersWithGames} with games this season.`,
  );
  io.log(
    `Games this season: ${counts.games} (kept in the database and the record files; they leave players' history).`,
  );
  if (!options.apply) {
    io.log(
      "Dry run: nothing changed. Run again with --apply --season <name> to start the new season.",
    );
    return "dry-run";
  }
  const name = options.season ?? "";
  if (!validSeason(name) || name === counts.season) {
    io.log(
      `--season needs a new name (a-z, 0-9, dashes; 2 to 32), not "${name}".`,
    );
    return "refused";
  }
  const typed = (
    await io.ask(`Type "${name}" to start season ${name}: `)
  ).trim();
  if (typed !== name) {
    io.log("Not confirmed: nothing changed.");
    return "cancelled";
  }
  const copy = backupDb(db, backupDir, `before-${name}`, io.now());
  io.log(`Backed up the database to ${copy}.`);
  startSeason(db, name, io.now());
  io.log(
    `Season ${name} started. Players' history now shows only games from this season on.`,
  );
  return "started";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      season: { type: "string" },
      db: { type: "string" },
    },
  });
  const file = resolve(
    values.db ?? process.env["GOJISIM_DB"] ?? "/data/gojisim.db",
  );
  const db = openDb(file);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const outcome = await resetHistory(
    db,
    join(dirname(file), "backups"),
    { apply: values.apply, season: values.season },
    {
      log: (line) => console.log(line),
      ask: (q) => rl.question(q),
      now: Date.now,
    },
  );
  rl.close();
  db.close();
  if (outcome === "refused") process.exitCode = 1;
}
