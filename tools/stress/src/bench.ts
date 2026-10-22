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
import { playGame } from "./stress";

/**
 * Engine speed for search bots (M6a): clone, applyAction and getLegalActions per call on real
 * mid-game states, plus full random games per second. `pnpm bench`.
 */

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
