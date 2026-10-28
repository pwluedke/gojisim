import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { BOTS, type BotSettings } from "@gojisim/bot";
import {
  type DeckSource,
  type GameResult,
  MATCH_TURN_CAP,
  playMatchGame,
  summarize,
} from "./match";

/**
 * Bot tournament (M6a): `pnpm bots --a weighted --b random --games 1000 --seed s --decks official`.
 * Seats alternate every game; the JSON report goes to `bot-reports/` (gitignored).
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
    "turn-cap": { type: "string", default: String(MATCH_TURN_CAP) },
    progress: { type: "string", default: "50" },
    // Play games in N child processes (one shard each), then merge the results in game order.
    workers: { type: "string", default: "1" },
    // Internal: which games a child plays ("k/N": games with game % N === k), and where it writes.
    shard: { type: "string" },
    results: { type: "string" },
    // pnpm runs this script inside tools/bots; INIT_CWD is where `pnpm bots` was typed.
    out: { type: "string", default: process.env["INIT_CWD"] ?? "." },
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
if (decks !== "official" && decks !== "random" && decks !== "mixed")
  throw new Error(
    `--decks must be official, random or mixed, got ${values.decks}`,
  );
const games = Number(values.games);
const progress = Number(values.progress);

const workers = Math.max(1, Number(values.workers));
const shard = values.shard?.split("/").map(Number) as
  [number, number] | undefined;
const mine = (game: number) => !shard || game % shard[1] === shard[0];

const results: GameResult[] = [];
if (workers > 1 && !shard) {
  // Each child replays this command for its shard and writes its results to a file.
  const dir = await mkdtemp(join(tmpdir(), "gojisim-bots-"));
  const args = process.argv
    .slice(2)
    .filter((x, i, all) => x !== "--workers" && all[i - 1] !== "--workers");
  let done = 0;
  await Promise.all(
    Array.from({ length: workers }, (_, k) => {
      const file = join(dir, `shard-${k}.json`);
      return new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            ...process.execArgv,
            process.argv[1] as string,
            ...args,
            "--shard",
            `${k}/${workers}`,
            "--results",
            file,
          ],
          { stdio: ["ignore", "ignore", "inherit"] },
        );
        child.on("exit", async (code) => {
          if (code !== 0)
            return reject(new Error(`shard ${k} exited with ${code}`));
          results.push(
            ...(JSON.parse(await readFile(file, "utf8")) as GameResult[]),
          );
          done++;
          console.log(
            `  shard ${done} / ${workers} done (${results.length} / ${games} games)`,
          );
          resolve();
        });
      });
    }),
  );
  results.sort((x, y) => x.game - y.game);
} else {
  for (let game = 0; game < games; game++) {
    if (!mine(game)) continue;
    results.push(
      playMatchGame(
        { bot: a, settings: aSettings },
        { bot: b, settings: bSettings },
        values.seed,
        game,
        decks,
        Number(values["turn-cap"]),
      ),
    );
    if (!shard && ((game + 1) % progress === 0 || game + 1 === games)) {
      const s = summarize(a, b, values.seed, decks, results);
      console.log(
        `  ${game + 1} / ${games}: ${label(a.name, aSettings)} ${s.wins.a}, ${label(b.name, bSettings)} ${s.wins.b}, draws ${s.wins.draws}`,
      );
    }
  }
  if (shard) {
    await writeFile(values.results as string, JSON.stringify(results));
    process.exit(0);
  }
}

const summary = summarize(a, b, values.seed, decks, results);
summary.a = label(a.name, aSettings);
summary.b = label(b.name, bSettings);
if (values.deterministic) summary.deterministic = true;
console.log(JSON.stringify(summary, null, 2));
const dir = `${values.out}/bot-reports`;
await mkdir(dir, { recursive: true });
const file =
  `${dir}/${new Date().toISOString().replace(/[:.]/g, "-")}-${summary.a}-vs-${summary.b}.json`.replace(
    /[(),=]/g,
    "_",
  );
await writeFile(
  file,
  // Per-decision times are summed up in the summary; the report leaves them out.
  `${JSON.stringify({ summary, games: results.map(({ times: _times, ...r }) => r) }, null, 2)}\n`,
);
console.log(`report: ${file}`);
