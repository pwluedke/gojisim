import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { GameRecord } from "@gojisim/engine";
import { replayAll } from "@gojisim/engine";
import { actionText, evaluation, parseSettings, runDecision } from "./decision";

/**
 * `pnpm bot-explain <record> --at <action index> [--seed S] [--difficulty D] [--max-ms N]`
 * (M13a): the bot's legal actions at one decision of a game record, with the search's visits and
 * mean values from the bot's own view, and the action it picks. Dev-only; never in the web app.
 * `--list` prints every bot decision in the record with what was played.
 *
 * The seed defaults to the browser's (`<botSeed>-<index>`); the search runs to its iteration
 * budget with no time limit unless `--max-ms` is given, so the output is the same on any machine.
 */
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    at: { type: "string" },
    seed: { type: "string" },
    difficulty: { type: "string" },
    "max-ms": { type: "string" },
    // Bot settings as key=value pairs, e.g. --set prune=0 (the old bot).
    set: { type: "string", default: "" },
    list: { type: "boolean", default: false },
  },
});
const file = positionals[0];
if (!file) throw new Error("Usage: pnpm bot-explain <record> --at <index>");
const record = JSON.parse(
  readFileSync(resolve(process.env["INIT_CWD"] ?? ".", file), "utf8"),
) as GameRecord & {
  botSeed?: string;
  seats?: Record<string, { kind: string; settings?: { difficulty?: number } }>;
};

if (values.list) {
  const states = replayAll(record);
  for (const [i, action] of record.actions.entries()) {
    if (record.seats?.[action.player]?.kind !== "bot") continue;
    const state = states[i] as (typeof states)[number];
    console.log(
      `${String(i).padStart(4)}  turn ${state.turn}  ${action.player}  ${actionText(state, action)}`,
    );
  }
} else {
  const at = Number(values.at);
  if (!Number.isInteger(at)) throw new Error("--at needs an action index");
  const state0 = replayAll({ ...record, actions: record.actions.slice(0, at) });
  const decider =
    state0.at(-1)?.pendingChoice?.player ?? state0.at(-1)?.turnPlayer ?? "P2";
  const difficulty = Number(
    values.difficulty ?? record.seats?.[decider]?.settings?.difficulty ?? 90,
  );
  const seed = values.seed ?? `${record.botSeed ?? "explain"}-${at}`;
  const run = runDecision(record, at, {
    seed,
    difficulty,
    settings: {
      ...parseSettings(values.set),
      ...(values["max-ms"] ? { maxMs: Number(values["max-ms"]) } : {}),
    },
  });
  const { state, player, decision } = run;
  const played = record.actions[at];
  console.log(
    `Decision ${at}: turn ${state.turn}, ${player} (difficulty ${difficulty}, seed ${seed})${state.pendingChoice ? `, choice ${state.pendingChoice.kind} ${state.pendingChoice.rule}` : ""}`,
  );
  if (played && played.player === player)
    console.log(`In the record: ${actionText(state, played)}`);
  const ev = evaluation(state, player);
  console.log(
    `Evaluation now: ${ev.value.toFixed(3)}  ${Object.entries(ev.features)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(", ")}`,
  );
  if (decision.blundered) console.log("Blunder roll: a random legal action.");
  if (decision.search)
    console.log(
      `Search: ${decision.search.iterations} iterations in ${decision.search.ms} ms`,
    );
  // Copies of one card share a key (decision 180): one row each.
  const rows = [...run.rows]
    .filter((r, i, all) => all.findIndex((x) => x.key === r.key) === i)
    .sort((a, b) => b.visits - a.visits);
  if (decision.search?.dead.size)
    console.log(`Pruned as dead: ${[...decision.search.dead].join(", ")}`);
  for (const row of rows)
    console.log(
      `${row.chosen ? "→" : " "} ${String(row.visits).padStart(5)}  ${row.mean === null ? "     –" : row.mean.toFixed(3).padStart(6)}  ${row.label}   [${row.key}]`,
    );
}
