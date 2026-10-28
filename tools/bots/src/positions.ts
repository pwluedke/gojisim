import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { GameRecord } from "@gojisim/engine";
import { parseSettings, runDecision } from "./decision";

/**
 * `pnpm bot-positions [--dir D] [--difficulties 90,100] [--seeds 20] [--settings k=v,...]
 * [--max-ms N] [--only name]` (M13a): each position (`tools/bots/positions/*.json`, a game record
 * cut at a bot decision plus action keys to `avoid` or `prefer`) runs over the seeds at each
 * difficulty, and the report is the share of seeds that pass. The search keeps the browser's 1 s
 * budget unless `--max-ms` says otherwise (`--max-ms 0`: no time limit, iterations only).
 */
const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    difficulties: { type: "string", default: "90,100" },
    seeds: { type: "string", default: "20" },
    settings: { type: "string", default: "" },
    "max-ms": { type: "string", default: "1000" },
    only: { type: "string" },
  },
});

interface Position {
  note: string;
  avoid?: string[];
  prefer?: string[];
  record: GameRecord;
}

const dir = values.dir
  ? resolve(process.env["INIT_CWD"] ?? ".", values.dir)
  : new URL("../positions/", import.meta.url).pathname;
const settings = parseSettings(values.settings);
const maxMs = Number(values["max-ms"]);
settings["maxMs"] = maxMs > 0 ? maxMs : Number.POSITIVE_INFINITY;
const difficulties = values.difficulties.split(",").map(Number);
const seeds = Number(values.seeds);

const matches = (key: string, prefixes: string[]) =>
  prefixes.some((p) => key === p || key.startsWith(`${p}:`));

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !values.only || f.startsWith(values.only))
  .sort();
const rows: string[] = [];
for (const file of files) {
  const position = JSON.parse(
    readFileSync(`${dir}/${file}`, "utf8"),
  ) as Position;
  const at = position.record.actions.length;
  const cells: string[] = [];
  for (const difficulty of difficulties) {
    let pass = 0;
    const ms: number[] = [];
    for (let i = 0; i < seeds; i++) {
      const started = performance.now();
      const run = runDecision(position.record, at, {
        seed: `position-${i}`,
        difficulty,
        settings,
      });
      ms.push(performance.now() - started);
      const key = run.rows.find((r) => r.chosen)?.key ?? "";
      const ok = position.avoid
        ? !matches(key, position.avoid)
        : matches(key, position.prefer ?? []);
      if (ok) pass++;
    }
    ms.sort((x, y) => x - y);
    cells.push(
      `${difficulty}: ${pass}/${seeds} (median ${Math.round(ms[Math.floor(seeds / 2)] ?? 0)} ms)`,
    );
  }
  const name = file.replace(/\.json$/, "");
  rows.push(`${name.padEnd(36)} ${cells.join("   ")}`);
  console.log(rows.at(-1));
}
