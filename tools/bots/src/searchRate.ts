import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  type Bot,
  type BotSettings,
  decide,
  difficultySettings,
  PRESETS,
} from "@gojisim/bot";
import { type DeckSource, playMatchGame } from "./match";

/**
 * Searches per move at the browser's 1 s budget (M13c), for fixed-search trials: Monarch's
 * testing plan (Oct 29, 2026) gives each bot in a trial its own measured iteration count, so a
 * slower play-out policy keeps its cost while the machine can do other work. Bot a and bot b play
 * each other timed (Hard's settings, then `--a-settings` / `--b-settings`), and every searched
 * decision's iterations are recorded per side. Run it alone on an idle machine.
 *
 * `pnpm search-rate --a-settings rollout=tactical --games 2 --seed s --shard 0/5 --out file.json`
 */
const { values } = parseArgs({
  options: {
    "a-settings": { type: "string", default: "" },
    "b-settings": { type: "string", default: "" },
    games: { type: "string", default: "2" },
    seed: { type: "string", default: "search-rate" },
    decks: { type: "string", default: "mixed" },
    // Games with game % N === k, so N copies can run side by side like a tournament's workers.
    shard: { type: "string", default: "0/1" },
    out: { type: "string" },
  },
});

/** "rollout=tactical,x=y" as bot settings (numbers where they parse). */
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

/** Hard, searching exactly as in the browser, recording each search's iteration count. */
function measuring(counts: number[]): Bot {
  return {
    name: "measured",
    chooseAction: (input) => {
      const settings = {
        ...difficultySettings(PRESETS.hard),
        ...input.settings,
      };
      const decision = decide({ ...input, settings });
      if (decision.search) counts.push(decision.search.iterations);
      return decision.action;
    },
  };
}

const counts = { a: [] as number[], b: [] as number[] };
const [k = 0, n = 1] = values.shard.split("/").map(Number);
for (let game = 0; game < Number(values.games); game++) {
  if (game % n !== k) continue;
  playMatchGame(
    {
      bot: measuring(counts.a),
      settings: parseSettings(values["a-settings"]),
    },
    {
      bot: measuring(counts.b),
      settings: parseSettings(values["b-settings"]),
    },
    values.seed,
    game,
    values.decks as DeckSource,
  );
}
const report = JSON.stringify({ shard: values.shard, counts });
if (values.out) await writeFile(values.out, report);
else console.log(report);
