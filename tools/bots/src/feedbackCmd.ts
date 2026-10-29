import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { PRESETS } from "@gojisim/bot";
import type { GameRecord } from "@gojisim/engine";
import { runDecision } from "./decision";
import { buildSummary, type RecordFile } from "./feedbackSummary";

/**
 * `pnpm feedback [--all] [--mark-reviewed] [--no-download]` (Paul, Oct 28, 2026), run from the
 * repo root: downloads every uploaded record from Railway's `/data/records` into the gitignored
 * `records/`, then writes `records/feedback-<YYYY-MM-DD>.md`: totals, the human's win rate by bot
 * level, and each report not yet reviewed (the bot's search for Bad Bot! / Good Bot!, the last
 * battle log lines for Report bug). `records/reviewed.json` holds the reviewed reports;
 * `--mark-reviewed` adds the ones listed, `--all` lists everything. Nothing on the server is
 * deleted: `/data/records` stays the full archive.
 */

/** The records folder's cap on the server (`MAX_RECORDS_DIR_BYTES`, 1 GB). */
const CAP = 1024 ** 3;

/** The download, as docs/deploy.md had it: tar over `railway ssh` into `dir`. */
export function downloadCommand(dir: string): string {
  return `mkdir -p ${dir} && railway ssh -i ~/.ssh/railway_ed25519 -- "tar czf - -C /data/records ." | tar xzf - -C ${dir}`;
}

/** Runs a shell command (pipefail on); its exit status and error output. */
export type Runner = (command: string) => { status: number; stderr: string };
const shell: Runner = (command) => {
  const r = spawnSync("bash", ["-o", "pipefail", "-c", command], {
    encoding: "utf8",
    stdio: ["ignore", "inherit", "pipe"],
  });
  return { status: r.status ?? 1, stderr: r.stderr ?? String(r.error ?? "") };
};

/**
 * Downloads the records into `dir`. Returns `null`, or a plain message with the manual command
 * when the download fails (no `railway` CLI, not linked, no SSH key, ...).
 */
export function downloadRecords(
  dir: string,
  run: Runner = shell,
): string | null {
  const command = downloadCommand(dir);
  const { status, stderr } = run(command);
  if (status === 0) return null;
  return [
    `Couldn't download the records from Railway${stderr.trim() ? `: ${stderr.trim().split("\n").at(-1)}` : ""}.`,
    "Check that the railway CLI is logged in and linked to the GojiSim service, and that ~/.ssh/railway_ed25519 is registered (docs/deploy.md step 4). Then run it by hand from the repo root:",
    `  ${command}`,
    "and make the summary from what's there with `pnpm feedback --no-download`.",
  ].join("\n");
}

/** Every record file under `dir` (skipping files that aren't game records). */
export function readRecords(dir: string): RecordFile[] {
  const walk = (d: string): string[] =>
    readdirSync(d)
      .sort()
      .flatMap((name) => {
        const path = join(d, name);
        if (statSync(path).isDirectory()) return walk(path);
        return name.endsWith(".json") && name !== "reviewed.json" ? [path] : [];
      });
  return walk(dir).flatMap((path) => {
    try {
      const record = JSON.parse(readFileSync(path, "utf8")) as GameRecord;
      if (record.version !== 1 || !Array.isArray(record.actions)) return [];
      return [{ file: relative(dir, path), record }];
    } catch {
      return [];
    }
  });
}

/** The bot's search at `at`, as `bot-explain` prints it: the top 5 moves by visits. */
export function explainTop(record: GameRecord, at: number): string[] | null {
  try {
    const action = record.actions[at];
    const seat = action ? record.seats?.[action.player] : undefined;
    const difficulty =
      seat?.kind === "bot" && typeof seat.settings?.["difficulty"] === "number"
        ? seat.settings["difficulty"]
        : PRESETS.hard;
    const run = runDecision(record, at, {
      seed: `${record.botSeed ?? `${String(record.seed)}-bots`}-${at}`,
      difficulty,
    });
    return [...run.rows]
      .filter((r, i, all) => all.findIndex((x) => x.key === r.key) === i)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5)
      .map(
        (row) =>
          `${row.chosen ? "→" : " "} ${String(row.visits).padStart(5)}  ${row.mean === null ? "     –" : row.mean.toFixed(3).padStart(6)}  ${row.label}`,
      );
  } catch {
    return null;
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      all: { type: "boolean", default: false },
      "mark-reviewed": { type: "boolean", default: false },
      "no-download": { type: "boolean", default: false },
      dir: { type: "string", default: "records" },
    },
  });
  const root = process.env["INIT_CWD"] ?? process.cwd();
  const dir = resolve(root, values.dir);
  if (!values["no-download"]) {
    console.log(`Downloading /data/records from Railway into ${dir} ...`);
    const failed = downloadRecords(dir);
    if (failed) {
      console.error(failed);
      process.exit(1);
    }
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const files = readRecords(dir);
  const reviewedPath = join(dir, "reviewed.json");
  const reviewed = new Set<string>(
    existsSync(reviewedPath)
      ? (JSON.parse(readFileSync(reviewedPath, "utf8")) as string[])
      : [],
  );
  const used = files.reduce(
    (sum, f) => sum + statSync(join(dir, f.file)).size,
    0,
  );
  const date = new Date().toISOString().slice(0, 10);
  const summary = buildSummary(files, {
    reviewed,
    all: values.all,
    explain: explainTop,
    bytes: { used, cap: CAP },
    date,
  });
  const out = join(dir, `feedback-${date}.md`);
  writeFileSync(out, summary.markdown);
  console.log(`Wrote ${out}`);
  if (values["mark-reviewed"]) {
    for (const key of summary.listed) reviewed.add(key);
    writeFileSync(reviewedPath, `${JSON.stringify([...reviewed], null, 2)}\n`);
    console.log(
      `Marked ${summary.listed.length} reports reviewed in ${reviewedPath}`,
    );
  }
}

if (process.argv[1]?.endsWith("feedbackCmd.ts")) main();
