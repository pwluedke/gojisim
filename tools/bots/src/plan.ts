import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { STOP_FILE } from "./decks";

/**
 * `pnpm bots-plan <plan.json>` (#170): runs a list of `pnpm bots` matchups in order. Each one is
 * an ordinary resumable run (M13c journal) with its report at
 * `bot-reports/plans/<name>/<id>.json`, so running the same command again skips the matchups
 * already reported and resumes the one in progress. `touch bot-reports/STOP` finishes the games
 * in progress and stops; delete the file and run the same command to go on.
 *
 * A plan:
 *   { "name": "spaceg",
 *     "defaults": { "a": "hard", "b": "hard", "games": 100, "seed": "spaceg", "workers": 17,
 *                   "deterministic": true, "keepRecords": true },
 *     "matchups": [ { "id": "A01-tangler", "aDeck": "local-decks/x.txt#Name",
 *                     "bDeck": "local-decks/y.txt#Other", "games": 100 } ] }
 */

interface Run {
  a?: string;
  b?: string;
  aSettings?: string;
  bSettings?: string;
  games?: number;
  seed?: string;
  workers?: number;
  deterministic?: boolean;
  keepRecords?: boolean;
  turnCap?: number;
  /**
   * #175: the deck source for a matchup without fixed decks (`official`, `random`, `mixed`, or
   * `meta`: the top-tier list in `metaDecks`, Paul's guard rule).
   */
  decks?: string;
  /** The `meta` source's deck-list file (default `local-decks/meta.txt`). */
  metaDecks?: string;
}

interface Matchup extends Run {
  id: string;
  /** Each bot's deck; leave both out to play `decks` (#175: new vs old Hard on mixed decks). */
  aDeck?: string;
  bDeck?: string;
}

export interface Plan {
  name: string;
  defaults?: Run;
  /** Matchups played at once (each with its own `workers`), in plan order; 1 by default. */
  concurrent?: number;
  matchups: Matchup[];
}

/** Where a plan's matchup writes its report and records, relative to the output folder. */
export const planDir = (plan: Plan) =>
  join("bot-reports", "plans", plan.name.replace(/[^\w.-]/g, "_"));

/** The `pnpm bots` arguments for one matchup. */
export function matchupArgs(plan: Plan, m: Matchup): string[] {
  const run = { ...plan.defaults, ...m };
  const dir = planDir(plan);
  return [
    ...["--a", run.a ?? "hard", "--b", run.b ?? "hard"],
    ...(run.aSettings ? ["--a-settings", run.aSettings] : []),
    ...(run.bSettings ? ["--b-settings", run.bSettings] : []),
    ...(m.aDeck && m.bDeck
      ? ["--a-deck", m.aDeck, "--b-deck", m.bDeck]
      : ["--decks", run.decks ?? "official"]),
    ...(run.metaDecks && !(m.aDeck && m.bDeck)
      ? ["--meta-decks", run.metaDecks]
      : []),
    ...["--games", String(run.games ?? 100)],
    ...["--seed", `${run.seed ?? plan.name}-${m.id}`],
    ...["--workers", String(run.workers ?? 1)],
    ...(run.deterministic ? ["--deterministic"] : []),
    ...(run.turnCap ? ["--turn-cap", String(run.turnCap)] : []),
    ...(run.keepRecords ? ["--keep-records", join(dir, "records", m.id)] : []),
    ...["--report", join(dir, `${m.id}.json`)],
    ...["--progress", "10"],
  ];
}

/**
 * #177: the current run, for `bots-pause`, `bots-resume` and `bots-status` (`shell.zsh`): the
 * run's folder on the first line and its plan file on the second. `GOJISIM_CURRENT_RUN` names
 * another file (tests).
 */
export const currentRunFile = () =>
  process.env["GOJISIM_CURRENT_RUN"] ?? join(homedir(), ".gojisim-current-run");

export function writeCurrentRun(dir: string, planFile: string): void {
  writeFileSync(
    currentRunFile(),
    `${resolve(dir)}\n${resolve(dir, planFile)}\n`,
  );
}

export function readCurrentRun(): { dir: string; plan: string } | null {
  if (!existsSync(currentRunFile())) return null;
  const [dir = "", plan = ""] = readFileSync(currentRunFile(), "utf8").split(
    "\n",
  );
  return dir && plan ? { dir, plan } : null;
}

/**
 * #177 `bots-status`: games played of each matchup's total, from its report once done, else from
 * its journal (`bot-reports/runs/<seed>-<key>/`).
 */
export function planStatus(
  plan: Plan,
  out: string,
): { id: string; played: number; total: number; done: boolean }[] {
  const runs = resolve(out, "bot-reports", "runs");
  const folders = existsSync(runs) ? readdirSync(runs) : [];
  return plan.matchups.map((m) => {
    const total = m.games ?? plan.defaults?.games ?? 100;
    const report = resolve(out, planDir(plan), `${m.id}.json`);
    if (existsSync(report)) {
      const games = (
        JSON.parse(readFileSync(report, "utf8")) as { games: unknown[] }
      ).games.length;
      return { id: m.id, played: games, total, done: true };
    }
    const seed =
      `${m.seed ?? plan.defaults?.seed ?? plan.name}-${m.id}`.replace(
        /[^\w.-]/g,
        "_",
      );
    let played = 0;
    for (const folder of folders.filter((f) => f.startsWith(`${seed}-`)))
      for (const f of readdirSync(join(runs, folder)).filter((f) =>
        f.endsWith(".jsonl"),
      ))
        played += readFileSync(join(runs, folder, f), "utf8")
          .split("\n")
          .filter((line) => line.trim()).length;
    return { id: m.id, played, total, done: false };
  });
}

async function main() {
  const out = process.env["INIT_CWD"] ?? ".";
  const file = process.argv[2];
  if (!file) throw new Error("Usage: pnpm bots-plan <plan.json> [--status]");
  const plan = JSON.parse(readFileSync(resolve(out, file), "utf8")) as Plan;
  if (process.argv.includes("--status")) {
    const rows = planStatus(plan, out);
    for (const r of rows)
      console.log(
        `${r.done ? "done   " : "       "} ${r.id}: ${r.played} / ${r.total}`,
      );
    const played = rows.reduce((n, r) => n + r.played, 0);
    const total = rows.reduce((n, r) => n + r.total, 0);
    console.log(`${played} / ${total} games`);
    return;
  }
  // #177: the commands in `shell.zsh` find this run.
  writeCurrentRun(out, file);
  const main = resolve(import.meta.dirname, "main.ts");
  const total = plan.matchups.length;
  let next = 0;
  let stopped = false;
  /** Plays matchups in plan order until none are left or the stop file appears. */
  const lane = async () => {
    while (!stopped && next < total) {
      const i = next++;
      const m = plan.matchups[i] as Matchup;
      const report = resolve(out, planDir(plan), `${m.id}.json`);
      if (existsSync(report)) {
        console.log(`[${i + 1}/${total}] ${m.id}: done`);
        continue;
      }
      if (existsSync(resolve(out, STOP_FILE))) {
        stopped = true;
        return;
      }
      console.log(`[${i + 1}/${total}] ${m.id}: playing`);
      const started = Date.now();
      const code = await new Promise<number | null>((done) =>
        spawn(
          process.execPath,
          [...process.execArgv, main, ...matchupArgs(plan, m)],
          {
            stdio: ["ignore", "inherit", "inherit"],
            env: { ...process.env, INIT_CWD: out },
          },
        ).on("exit", done),
      );
      if (code !== 0) throw new Error(`${m.id} exited with ${code}`);
      if (!existsSync(report)) {
        stopped = true;
        return;
      }
      console.log(
        `[${i + 1}/${total}] ${m.id}: done in ${Math.round((Date.now() - started) / 60000)} min`,
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, plan.concurrent ?? 1) }, lane),
  );
  if (stopped) {
    console.log(
      `Stopped (${STOP_FILE}). Delete it and run the same command to resume.`,
    );
    return;
  }
  console.log(`Plan ${plan.name} done: reports in ${planDir(plan)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
