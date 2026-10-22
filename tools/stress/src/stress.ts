import { buildTestDeck } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  buildLoopReport,
  checkInvariants,
  type GameRecord,
  type GameState,
  getLegalActions,
  type LoopReport,
  startGame,
} from "@gojisim/engine";

/** A game still running at this turn counts as a failure. */
export const TURN_CAP = 500;

/** Deck pairings, alternated game by game. */
export const PAIRINGS: readonly (readonly [string, string])[] = [
  ["ESD01", "ESD02"],
  ["ESD02", "ESD01"],
  ["ESD01", "ESD01"],
  ["ESD02", "ESD02"],
];

export interface GameOutcome {
  game: number;
  seed: string;
  record: GameRecord;
  turns: number;
  actions: number;
  result: GameState["result"];
  /** Set when the game failed: an invariant broke, the engine threw, or the turn cap was hit. */
  failure: { reason: string; problems: string[]; atAction: number } | null;
  /** Set when the game ended in an infinite-loop draw (13.1.1.3). */
  loopReport: LoopReport | null;
}

/** mulberry32, seeded per game, for picking actions. */
function picker(seed: string): (n: number) => number {
  let state = [...seed].reduce(
    (h, ch) => Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0,
    0x811c9dc5,
  );
  return (n) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/**
 * Plays one game with uniformly random legal actions (every `choose` included, `concede`
 * excluded), checking the invariants after every action (spec case 52).
 */
export function playGame(
  runSeed: string | number,
  game: number,
  turnCap = TURN_CAP,
): GameOutcome {
  const seed = `${runSeed}-${game}`;
  const [setA, setB] = PAIRINGS[game % PAIRINGS.length] as readonly [
    string,
    string,
  ];
  const decks = [setA, setB].map((set, i) => {
    const deck = buildTestDeck(set, `${seed}-P${i + 1}`);
    return {
      id: `P${i + 1}`,
      monsterDeck: deck.monsterDeck,
      mainDeck: deck.mainDeck,
    };
  }) as GameRecord["decks"];
  const record: GameRecord = { version: 1, seed, decks, actions: [] };
  const pick = picker(seed);
  const outcome = (
    state: GameState,
    failure: GameOutcome["failure"],
  ): GameOutcome => ({
    game,
    seed,
    record,
    turns: state.turn,
    actions: record.actions.length,
    result: state.result,
    failure,
    loopReport: state.loop ? buildLoopReport(record, state) : null,
  });

  let state: GameState;
  try {
    state = startGame(record);
  } catch (err) {
    return {
      game,
      seed,
      record,
      turns: 0,
      actions: 0,
      result: null,
      loopReport: null,
      failure: {
        reason: "engine threw during setup",
        problems: [String(err)],
        atAction: 0,
      },
    };
  }
  for (;;) {
    const problems = checkInvariants(state);
    if (problems.length > 0) {
      return outcome(state, {
        reason: "invariant violated",
        problems,
        atAction: record.actions.length,
      });
    }
    if (state.result !== null) return outcome(state, null);
    if (state.turn > turnCap) {
      return outcome(state, {
        reason: `turn cap ${turnCap} reached`,
        problems: [],
        atAction: record.actions.length,
      });
    }
    const decider = state.pendingChoice?.player ?? state.turnPlayer;
    const options = getLegalActions(state, decider).filter(
      (a) => a.type !== "concede",
    );
    const action = options[pick(options.length)] as Action;
    record.actions.push(action);
    try {
      state = advanceToDecision(applyAction(state, action));
    } catch (err) {
      return outcome(state, {
        reason: "engine threw",
        problems: [
          err instanceof Error ? (err.stack ?? err.message) : String(err),
        ],
        atAction: record.actions.length,
      });
    }
  }
}
