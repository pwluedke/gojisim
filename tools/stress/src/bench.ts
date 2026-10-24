import {
  type Action,
  advanceToDecision,
  applyAction,
  cloneState,
  type GameState,
  getLegalActions,
  replayAll,
  startGame,
} from "@gojisim/engine";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  type Baseline,
  checkGuard,
  GUARD,
  measureGuard,
  relativeTimes,
} from "./guard";
import { playGame } from "./stress";

/**
 * Engine speed for search bots (M6a): clone, applyAction and getLegalActions per call on real
 * mid-game states, plus full random games per second. `pnpm bench`.
 *
 * `pnpm bench --check` runs only the speed guard (`guard.ts`) and fails if `applyAction` or
 * `getLegalActions` is more than 50 % over `bench/baseline.json` (CI). `pnpm bench
 * --update-baseline` measures the guard and writes the baseline, for a PR that accepts a slowdown
 * (or a speedup) on purpose.
 */

const { values: flags } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
    "update-baseline": { type: "boolean", default: false },
    "measured-on": { type: "string", default: "local" },
  },
});
const baselineUrl = new URL("../../../bench/baseline.json", import.meta.url);

if (flags.check || flags["update-baseline"]) {
  const times = measureGuard();
  const relative = relativeTimes(times);
  const round = (n: number) => Number(n.toFixed(2));
  const measured = {
    microseconds: {
      calibration: round(times.calibration),
      applyAction: round(times.applyAction),
      getLegalActions: round(times.getLegalActions),
    },
    relative,
  };
  if (flags["update-baseline"]) {
    const baseline: Baseline = {
      guard: GUARD,
      measuredOn: flags["measured-on"] as string,
      date: new Date().toISOString().slice(0, 10),
      ...measured,
    };
    writeFileSync(baselineUrl, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(JSON.stringify(baseline, null, 2));
    process.exit(0);
  }
  const baseline = JSON.parse(readFileSync(baselineUrl, "utf8")) as Baseline;
  const problems = checkGuard(times, baseline);
  console.log(
    JSON.stringify({ measured, baseline: baseline.relative }, null, 2),
  );
  if (problems.length > 0) {
    console.error(
      [
        "Speed guard failed:",
        ...problems.map((p) => `  ${p}`),
        "If the slowdown is accepted, run `pnpm bench --update-baseline` and commit bench/baseline.json.",
      ].join("\n"),
    );
    process.exit(1);
  }
  console.log("Speed guard passed.");
  process.exit(0);
}

const states: GameState[] = [];
for (let game = 0; game < 12; game++) {
  const { record } = playGame(
    "bench",
    game,
    500,
    "weighted",
    game % 2 ? "official" : "random",
  );
  states.push(...replayAll(record));
}

/** Microseconds per call of `fn` over every sample, repeated until about `ms` have passed. */
function time(fn: (state: GameState) => unknown, ms = 1500): number {
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < ms)
    for (const state of states) {
      fn(state);
      calls++;
    }
  return ((performance.now() - start) * 1000) / calls;
}

/** A plain JSON value, deep-copied by hand (no functions, Dates or cycles). */
function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = cloneValue(value[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const key in value) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = cloneValue(v);
  }
  return out as T;
}

const decider = (s: GameState) => s.pendingChoice?.player ?? s.turnPlayer;
const firstAction = (s: GameState): Action | undefined =>
  getLegalActions(s, decider(s)).find((a) => a.type !== "concede");
const playable = states.filter((s) => s.result === null && firstAction(s));

const json = time((s) => JSON.parse(JSON.stringify(s)));
const structured = time((s) => structuredClone(s));
const manual = time((s) => cloneValue(s));
const sharedLog = time((s) => ({
  ...cloneValue({ ...s, log: [] }),
  log: s.log.slice(),
}));
const sharedLogAndCards = time((s) => ({
  ...cloneValue({ ...s, log: [], cards: {} }),
  log: s.log.slice(),
  cards: s.cards,
}));
const engineClone = time((s) => cloneState(s));
const legal = time((s) => getLegalActions(s, decider(s)));
const apply = (() => {
  const actions = new Map(playable.map((s) => [s, firstAction(s) as Action]));
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < 1500)
    for (const s of playable) {
      applyAction(s, actions.get(s) as Action);
      calls++;
    }
  return ((performance.now() - start) * 1000) / calls;
})();

/** Full games of uniformly random legal actions, no invariant checks. */
const gamesPerSecond = (() => {
  let games = 0;
  let pick = 12345;
  const rand = (n: number) => {
    pick = (Math.imul(pick, 1103515245) + 12345) >>> 0;
    return pick % n;
  };
  const start = performance.now();
  while (performance.now() - start < 3000) {
    const record = playGame(
      "bench-decks",
      games,
      500,
      "uniform",
      "official",
    ).record;
    let state = advanceToDecision(startGame(record));
    for (let n = 0; state.result === null && n < 5000; n++) {
      const options = getLegalActions(state, decider(state)).filter(
        (a) => a.type !== "concede",
      );
      state = advanceToDecision(
        applyAction(state, options[rand(options.length)] as Action),
      );
    }
    games++;
  }
  return (games * 1000) / (performance.now() - start);
})();

const size = Math.round(
  states.reduce((n, s) => n + JSON.stringify(s).length, 0) /
    states.length /
    1024,
);
const report = {
  samples: states.length,
  averageStateKB: size,
  cloneMicroseconds: {
    engine: Number(engineClone.toFixed(1)),
    jsonRoundTrip: Number(json.toFixed(1)),
    structuredClone: Number(structured.toFixed(1)),
    handWritten: Number(manual.toFixed(1)),
    handWrittenSharedLog: Number(sharedLog.toFixed(1)),
    handWrittenSharedLogAndCards: Number(sharedLogAndCards.toFixed(1)),
  },
  applyActionMicroseconds: Number(apply.toFixed(1)),
  getLegalActionsMicroseconds: Number(legal.toFixed(1)),
  randomGamesPerSecond: Number(gamesPerSecond.toFixed(1)),
};
console.log(JSON.stringify(report, null, 2));
