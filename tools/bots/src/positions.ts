import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { actionKey } from "@gojisim/bot";
import { type GameRecord, replayAll } from "@gojisim/engine";
import { parseSettings, runDecision } from "./decision";

/**
 * `pnpm bot-positions [--dir D] [--difficulties 90,100] [--seeds 20] [--settings k=v,...]
 * [--max-ms N] [--only name]` (M13a): each position (`tools/bots/positions/*.json`, a game record
 * cut at a bot decision plus action keys to `avoid` or `prefer`) runs over the seeds at each
 * difficulty, and the report is the share of seeds that pass. The search keeps the browser's 1 s
 * budget unless `--max-ms` says otherwise (`--max-ms 0`: no time limit, iterations only).
 *
 * `pnpm bot-positions --from <record> --at <actionIndex> [--out file]` (M13b) writes a position to
 * start from instead: the record cut before that action, with the recorded action's key to avoid
 * and the Bad Bot! text at that index as its note. Uploaded records hold players' decks, so the
 * file goes next to the record unless `--out` says otherwise; committed positions still use
 * starters, test decks or made-up decks.
 */
const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    difficulties: { type: "string", default: "90,100" },
    seeds: { type: "string", default: "20" },
    settings: { type: "string", default: "" },
    "max-ms": { type: "string", default: "1000" },
    only: { type: "string" },
    from: { type: "string" },
    at: { type: "string" },
    out: { type: "string" },
  },
});

interface Position {
  note: string;
  avoid?: string[];
  prefer?: string[];
  record: GameRecord;
}

if (values.from) {
  const from = resolve(process.env["INIT_CWD"] ?? ".", values.from);
  const record = JSON.parse(readFileSync(from, "utf8")) as GameRecord;
  const at = Number(values.at);
  if (!Number.isInteger(at) || at < 0 || at >= record.actions.length)
    throw new Error(
      `--at needs an action index from 0 to ${record.actions.length - 1}`,
    );
  const action = record.actions[at] as GameRecord["actions"][number];
  const state = replayAll({
    ...record,
    actions: record.actions.slice(0, at),
  }).at(-1);
  if (!state) throw new Error("Could not replay the record");
  const feedback = record.botFeedback?.filter((f) => f.actionIndex === at);
  // The position is the game up to the decision: no reports, no export position.
  const {
    botFeedback: _feedback,
    bugReports: _bugs,
    position: _position,
    ...kept
  } = record as GameRecord & { position?: number };
  const position: Position & { made: string } = {
    note:
      feedback?.map((f) => `${f.reporter}: ${f.text}`).join(" / ") ||
      `Action ${at} of ${basename(from)}`,
    made: `pnpm bot-positions --from ${basename(from)} --at ${at}`,
    avoid: [actionKey(state, action)],
    record: { ...kept, actions: record.actions.slice(0, at) },
  };
  const out = values.out
    ? resolve(process.env["INIT_CWD"] ?? ".", values.out)
    : from.replace(/\.json$/, `-at-${at}.json`);
  writeFileSync(out, `${JSON.stringify(position, null, 2)}\n`);
  console.log(`Wrote ${out} (avoid ${position.avoid?.join(", ")})`);
  process.exit(0);
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
