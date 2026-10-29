import { createHash } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { GameResult } from "./match";

/**
 * M13c: every finished game is appended to a journal as one JSON line, so a run killed part way
 * (a forced restart lost an 800-game run) picks up where it stopped when the same command runs
 * again. The journal is a folder per run under `bot-reports/runs/`, one file per process.
 */

/** A short key for everything that decides a run's games: same command, same key. */
export function runKey(run: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(run))
    .digest("hex")
    .slice(0, 12);
}

/** The journal folder for a run: its seed (made safe for a file name) plus its key. */
export function journalDir(
  out: string,
  seed: string,
  run: Record<string, unknown>,
): string {
  return join(
    out,
    "bot-reports",
    "runs",
    `${seed.replace(/[^\w.-]/g, "_")}-${runKey(run)}`,
  );
}

/** Every game recorded in the folder's journals, by game number. A cut-off last line is skipped. */
export async function readJournal(
  dir: string,
): Promise<Map<number, GameResult>> {
  const done = new Map<number, GameResult>();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return done;
  }
  for (const file of files.filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of (await readFile(join(dir, file), "utf8")).split("\n")) {
      if (!line.trim()) continue;
      try {
        const result = JSON.parse(line) as GameResult;
        done.set(result.game, result);
      } catch {
        // A process killed mid-write leaves a partial line; that game is played again.
      }
    }
  }
  return done;
}

/** Appends one finished game to this process's journal file. */
export async function appendJournal(
  dir: string,
  file: string,
  result: GameResult,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, file), `${JSON.stringify(result)}\n`);
}

/** Removes a finished run's journal once its report is written. */
export async function clearJournal(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
