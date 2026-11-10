import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BOTS, type BotSettings } from "@gojisim/bot";
import { formatDeckList } from "@gojisim/cards/deck-lists";
import { defaultMetaDecks, loadDeck, loadMetaDecks, STOP_FILE } from "./decks";
import {
  appendJournal,
  clearJournal,
  journalDir,
  readJournal,
} from "./journal";
import {
  type DeckSource,
  type GameResult,
  MATCH_TURN_CAP,
  type MatchOptions,
  playMatchGame,
  summarize,
} from "./match";

/**
 * Bot tournament (M6a): `pnpm bots --a weighted --b random --games 1000 --seed s --decks official`.
 * Seats alternate every game; the JSON report goes to `bot-reports/` (gitignored). Each finished
 * game is journaled under `bot-reports/runs/`, so the same command run again after a crash or a
 * restart plays only the games still missing (M13c).
 *
 * #170: `--a-deck <file>#<deck name>` and `--b-deck …` give each bot its own deck (or
 * `random:<SET>` for a random test deck with a fixed seed); `--keep-records <dir>` keeps every
 * game's record; `--report <file>` names the report. A `bot-reports/STOP` file stops the run after
 * the games in progress, keeping the journal: delete it and run the same command to resume.
 *
 * `--decks meta` plays the top-tier decks in `--meta-decks <file>`: by default the decks tagged Meta
 * in the one deck list `local-decks/decks.txt` (Paul, Nov 9), or `local-decks/meta.txt` while it
 * isn't there (both
 * gitignored): every ordered pairing, two games each with the seats swapped. Bot guards run on it.
 */
const { values } = parseArgs({
  options: {
    a: { type: "string", default: "weighted" },
    b: { type: "string", default: "random" },
    // Bot settings as comma-separated key=value pairs, e.g. --a-settings samples=4.
    "a-settings": { type: "string", default: "" },
    "b-settings": { type: "string", default: "" },
    // Turn the time budget (maxMs) off, so search bots stop on iterations only and a run depends
    // only on its seed, not on the machine's speed (M6c review).
    deterministic: { type: "boolean", default: false },
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    decks: { type: "string", default: "official" },
    "meta-decks": { type: "string" },
    "turn-cap": { type: "string", default: String(MATCH_TURN_CAP) },
    progress: { type: "string", default: "50" },
    // Play games in N child processes (one shard each), then merge the results in game order.
    workers: { type: "string", default: "1" },
    // Internal: which games a child plays ("k/N": games with game % N === k), and its journal.
    shard: { type: "string" },
    journal: { type: "string" },
    // pnpm runs this script inside tools/bots; INIT_CWD is where `pnpm bots` was typed.
    out: { type: "string", default: process.env["INIT_CWD"] ?? "." },
    // #170 deck-vs-deck, kept records and the report's path.
    "a-deck": { type: "string" },
    "b-deck": { type: "string" },
    "keep-records": { type: "string" },
    report: { type: "string" },
  },
});
const a = BOTS[values.a];
const b = BOTS[values.b];
if (!a || !b)
  throw new Error(`Unknown bot; choose from ${Object.keys(BOTS).join(", ")}`);
/** "samples=4,x=y" as bot settings (numbers where they parse). */
function parseSettings(text: string): BotSettings {
  return Object.fromEntries(
    text
      .split(",")
      .filter((pair) => pair.includes("="))
      .map((pair) => {
        const [key = "", value = ""] = pair.split("=");
        const n = Number(value);
        return [key.trim(), Number.isNaN(n) ? value.trim() : n];
      }),
  );
}
const noClock: BotSettings = values.deterministic
  ? { maxMs: Number.MAX_SAFE_INTEGER }
  : {};
const aSettings = { ...parseSettings(values["a-settings"]), ...noClock };
const bSettings = { ...parseSettings(values["b-settings"]), ...noClock };
const label = (name: string, settings: BotSettings) =>
  Object.keys(settings).some((k) => k !== "maxMs")
    ? `${name}(${Object.entries(settings)
        .filter(([k]) => k !== "maxMs")
        .map(([k, v]) => `${k}=${v}`)
        .join(",")})`
    : name;
const decks = values.decks as DeckSource;
// #170: both decks or neither; each is read from its file and must pass `validateDeck`.
if (!values["a-deck"] !== !values["b-deck"])
  throw new Error("--a-deck and --b-deck go together");
const fixed =
  values["a-deck"] && values["b-deck"]
    ? {
        a: loadDeck(values["a-deck"], values.out, values.seed),
        b: loadDeck(values["b-deck"], values.out, values.seed),
      }
    : undefined;
const options: MatchOptions = {
  ...(fixed ? { fixed } : {}),
  ...(values["keep-records"]
    ? { recordDir: resolve(values.out, values["keep-records"]) }
    : {}),
};
const stopFile = resolve(values.out, STOP_FILE);
if (
  decks !== "official" &&
  decks !== "random" &&
  decks !== "mixed" &&
  decks !== "meta"
)
  throw new Error(
    `--decks must be official, random, mixed or meta, got ${values.decks}`,
  );
const meta =
  decks === "meta" && !fixed
    ? loadMetaDecks(
        values["meta-decks"] ?? defaultMetaDecks(values.out),
        values.out,
      )
    : undefined;
if (meta) options.meta = meta;
const games = Number(values.games);
const progress = Number(values.progress);

const workers = Math.max(1, Number(values.workers));
const shard = values.shard?.split("/").map(Number) as
  [number, number] | undefined;
const mine = (game: number) => !shard || game % shard[1] === shard[0];

// Everything that decides which games are played and how; the worker count doesn't.
const journal =
  values.journal ??
  journalDir(values.out, values.seed, {
    a: values.a,
    b: values.b,
    aSettings,
    bSettings,
    seed: values.seed,
    decks,
    games,
    turnCap: values["turn-cap"],
    // The meta list's decks, so a changed top-tier list is a new run.
    ...(meta ? { meta: formatDeckList(meta) } : {}),
    // The decks' lists, so a changed variant is a new run.
    ...(fixed
      ? {
          aDeck: formatDeckList([fixed.a]),
          bDeck: formatDeckList([fixed.b]),
        }
      : {}),
  });
const played = await readJournal(journal);
if (!shard && played.size > 0)
  console.log(
    `  resuming ${journal}: ${played.size} / ${games} games already played`,
  );

let results: GameResult[] = [];
if (workers > 1 && !shard) {
  // Each child replays this command for its shard and journals its games; the parent reads them.
  const args = process.argv
    .slice(2)
    .filter((x, i, all) => x !== "--workers" && all[i - 1] !== "--workers");
  let done = 0;
  await Promise.all(
    Array.from({ length: workers }, (_, k) => {
      return new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            ...process.execArgv,
            process.argv[1] as string,
            ...args,
            "--shard",
            `${k}/${workers}`,
            "--journal",
            journal,
          ],
          { stdio: ["ignore", "ignore", "inherit"] },
        );
        child.on("exit", async (code) => {
          if (code !== 0)
            return reject(new Error(`shard ${k} exited with ${code}`));
          done++;
          console.log(
            `  shard ${done} / ${workers} done (${(await readJournal(journal)).size} / ${games} games)`,
          );
          resolve();
        });
      });
    }),
  );
  results = [...(await readJournal(journal)).values()].sort(
    (x, y) => x.game - y.game,
  );
} else {
  const file = `shard-${shard ? shard[0] : 0}.jsonl`;
  for (let game = 0; game < games; game++) {
    if (!mine(game)) continue;
    const old = played.get(game);
    // #170: the stop file ends the run between games; the journal keeps what's done.
    if (!old && existsSync(stopFile)) break;
    const result =
      old ??
      playMatchGame(
        { bot: a, settings: aSettings },
        { bot: b, settings: bSettings },
        values.seed,
        game,
        decks,
        Number(values["turn-cap"]),
        options,
      );
    if (!old) await appendJournal(journal, file, result);
    results.push(result);
    if (!shard && ((game + 1) % progress === 0 || game + 1 === games)) {
      const s = summarize(a, b, values.seed, decks, results);
      console.log(
        `  ${game + 1} / ${games}: ${label(a.name, aSettings)} ${s.wins.a}, ${label(b.name, bSettings)} ${s.wins.b}, draws ${s.wins.draws}`,
      );
    }
  }
  if (shard) process.exit(0);
}

if (results.length < games) {
  // Stopped by the stop file: no report yet, and the journal stays for the resume.
  console.log(
    `  stopped (${STOP_FILE}): ${results.length} / ${games} games played; delete it and run the same command to resume`,
  );
  process.exit(0);
}
const summary = summarize(a, b, values.seed, decks, results);
if (fixed) {
  summary.aDeck = fixed.a.name;
  summary.bDeck = fixed.b.name;
}
summary.a = label(a.name, aSettings);
summary.b = label(b.name, bSettings);
if (values.deterministic) summary.deterministic = true;
console.log(JSON.stringify(summary, null, 2));
const dir = `${values.out}/bot-reports`;
await mkdir(dir, { recursive: true });
const file = values.report
  ? resolve(values.out, values.report)
  : `${dir}/${new Date().toISOString().replace(/[:.]/g, "-")}-${summary.a}-vs-${summary.b}.json`.replace(
      /[(),=]/g,
      "_",
    );
await mkdir(dirname(file), { recursive: true });
await writeFile(
  file,
  // Per-decision times are summed up in the summary; the report leaves them out.
  `${JSON.stringify({ summary, games: results.map(({ times: _times, ...r }) => r) }, null, 2)}\n`,
);
await clearJournal(journal);
console.log(`report: ${file}`);
