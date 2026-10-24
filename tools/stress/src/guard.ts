import {
  type Action,
  applyAction,
  getLegalActions,
  type GameState,
  replayAll,
} from "@gojisim/engine";
import { pairingsFor, playGame } from "./stress";

/**
 * The CI speed guard on `pnpm bench` (Monarch, after M12b-2: a slowdown went unseen for 3 PRs).
 * Fixed games (seed, sets, policy) give the same sample states every run; each round times
 * `applyAction` and `getLegalActions` over all of them, and the medians are compared with the
 * committed baseline (`bench/baseline.json`).
 *
 * Times are divided by a fixed plain-JavaScript workload timed in the same rounds, so a slower or
 * busier machine scales both alike; the raw microseconds are reported too.
 */

export const GUARD = {
  seed: "bench-guard",
  games: 8,
  // The M12 decks: random test decks of the first two booster sets, each against each.
  sets: ["EBP01", "EBP02"],
  policy: "weighted",
  rounds: 9,
  roundMs: 150,
  /** A median more than this much over the baseline fails the check. */
  maxSlowdown: 0.5,
} as const;

export interface GuardTimes {
  /** Microseconds per call of the calibration workload. */
  calibration: number;
  applyAction: number;
  getLegalActions: number;
}

export interface Baseline {
  guard: typeof GUARD;
  /** Where the baseline was measured, for reference (CI's runner is what the check runs on). */
  measuredOn: string;
  date: string;
  /** Median microseconds per call. */
  microseconds: GuardTimes;
  /** Median microseconds per call divided by the calibration's, which is what the check compares. */
  relative: { applyAction: number; getLegalActions: number };
}

const decider = (s: GameState) => s.pendingChoice?.player ?? s.turnPlayer;

/** The guard's sample states, with the first non-concede action of each one that has one. */
export function guardSamples(): { states: GameState[]; actions: Action[] } {
  const pairings = pairingsFor(GUARD.sets);
  const states: GameState[] = [];
  for (let game = 0; game < GUARD.games; game++) {
    const { record } = playGame(
      GUARD.seed,
      game,
      500,
      GUARD.policy,
      "random",
      pairings,
    );
    states.push(...replayAll(record));
  }
  const actions: Action[] = [];
  const playable: GameState[] = [];
  for (const s of states) {
    const action = getLegalActions(s, decider(s)).find(
      (a) => a.type !== "concede",
    );
    if (s.result === null && action) {
      playable.push(s);
      actions.push(action);
    }
  }
  return { states: playable, actions };
}

/**
 * The calibration: object building, array work and string keys, like the engine's own work but
 * independent of engine code. Returns a number so the work can't be skipped.
 */
function calibrate(): number {
  const items = Array.from({ length: 400 }, (_, i) => ({
    id: `c${i}`,
    rank: i % 7,
    tags: [i % 3, i % 5],
  }));
  const byRank = new Map<number, string[]>();
  for (const item of items) {
    const list = byRank.get(item.rank) ?? [];
    list.push(item.id);
    byRank.set(item.rank, list);
  }
  const copy = items
    .filter((item) => item.tags[0] !== 1)
    .map((item) => ({ ...item, tags: [...item.tags] }))
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return copy.length + byRank.size;
}

/** Microseconds per call: `run` repeated until about `ms` have passed. */
function perCall(run: () => number, ms: number): number {
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < ms) calls += run();
  return ((performance.now() - start) * 1000) / calls;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};

/** Median times over `GUARD.rounds` rounds; the three measures take turns within each round. */
export function measureGuard(samples = guardSamples()): GuardTimes {
  const { states, actions } = samples;
  const rounds: GuardTimes[] = [];
  let sink = 0;
  // One warm-up round lets the JIT settle before anything counts.
  for (let round = 0; round <= GUARD.rounds; round++) {
    const times: GuardTimes = {
      calibration: perCall(() => {
        sink += calibrate();
        return 1;
      }, GUARD.roundMs),
      applyAction: perCall(() => {
        states.forEach((s, i) => applyAction(s, actions[i] as Action));
        return states.length;
      }, GUARD.roundMs),
      getLegalActions: perCall(() => {
        for (const s of states) sink += getLegalActions(s, decider(s)).length;
        return states.length;
      }, GUARD.roundMs),
    };
    if (round > 0) rounds.push(times);
  }
  if (sink < 0) throw new Error("unreachable");
  return {
    calibration: median(rounds.map((r) => r.calibration)),
    applyAction: median(rounds.map((r) => r.applyAction)),
    getLegalActions: median(rounds.map((r) => r.getLegalActions)),
  };
}

export function relativeTimes(times: GuardTimes): Baseline["relative"] {
  return {
    applyAction: Number((times.applyAction / times.calibration).toFixed(4)),
    getLegalActions: Number(
      (times.getLegalActions / times.calibration).toFixed(4),
    ),
  };
}

/** Problems with `times` against `baseline`: each measure more than 50 % slower. */
export function checkGuard(times: GuardTimes, baseline: Baseline): string[] {
  const relative = relativeTimes(times);
  const problems: string[] = [];
  for (const key of ["applyAction", "getLegalActions"] as const) {
    const limit = baseline.relative[key] * (1 + GUARD.maxSlowdown);
    if (relative[key] > limit)
      problems.push(
        `${key} is ${Math.round((relative[key] / baseline.relative[key] - 1) * 100)} % over the baseline ` +
          `(${relative[key]} vs ${baseline.relative[key]} calibration units; limit ${limit.toFixed(4)})`,
      );
  }
  return problems;
}
