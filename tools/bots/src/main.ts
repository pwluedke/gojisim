import { mkdir, writeFile } from "node:fs/promises";
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
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    decks: { type: "string", default: "official" },
    "turn-cap": { type: "string", default: String(MATCH_TURN_CAP) },
    progress: { type: "string", default: "50" },
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
const aSettings = parseSettings(values["a-settings"]);
const bSettings = parseSettings(values["b-settings"]);
const label = (name: string, settings: BotSettings) =>
  Object.keys(settings).length
    ? `${name}(${Object.entries(settings)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")})`
    : name;
const decks = values.decks as DeckSource;
if (decks !== "official" && decks !== "random")
  throw new Error(`--decks must be official or random, got ${values.decks}`);
const games = Number(values.games);
const progress = Number(values.progress);

const results: GameResult[] = [];
for (let game = 0; game < games; game++) {
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
  if ((game + 1) % progress === 0 || game + 1 === games) {
    const s = summarize(a, b, values.seed, decks, results);
    s.a = label(a.name, aSettings);
    s.b = label(b.name, bSettings);
    console.log(
      `  ${game + 1} / ${games}: ${s.a} ${s.wins.a}, ${s.b} ${s.wins.b}, draws ${s.wins.draws}`,
    );
  }
}

const summary = summarize(a, b, values.seed, decks, results);
summary.a = label(a.name, aSettings);
summary.b = label(b.name, bSettings);
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
  `${JSON.stringify({ summary, games: results }, null, 2)}\n`,
);
console.log(`report: ${file}`);
