import { readFileSync } from "node:fs";
import { type NamedDeck, parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck } from "@gojisim/cards/test-decks";
import { weightedChoice } from "@gojisim/bot";
import {
  type Action,
  advanceToDecision,
  applyAction,
  buildLoopReport,
  deckLegalityFor,
  checkInvariants,
  type GameRecord,
  type GameState,
  getLegalActions,
  getPlayerView,
  REPLACEMENT_ORDER_IN_RULE_ACTION,
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

/**
 * Where decks come from: `random` test decks (`buildTestDeck`), the `official` starter lists, or
 * a deck list `file` (`--deck-file`, M12: Paul's local decks).
 */
export type DeckSource = "random" | "official" | "file";

/** Pairings that play every listed set against itself and the others, in turn (`--sets`). */
export function pairingsFor(sets: readonly string[]): [string, string][] {
  return sets.flatMap((a) => sets.map((b): [string, string] => [a, b]));
}

/**
 * The two decks of game `game` from a deck file's decks: every deck plays in turn, each time
 * against a different one (a deck plays itself only when the file has one deck).
 */
export function filePairing(game: number, count: number): [number, number] {
  const a = game % count;
  if (count === 1) return [a, a];
  const offset = 1 + (Math.floor(game / count) % (count - 1));
  return [a, (a + offset) % count];
}

const OFFICIAL_FILES: Record<string, string> = {
  ESD01: "esd01-starter.txt",
  ESD02: "esd02-starter.txt",
};

let officialDecks: Map<string, NamedDeck> | null = null;

/** The official starter deck of a set, from `packages/cards/data/decks/`. */
export function officialDeck(set: string): NamedDeck {
  officialDecks ??= new Map(
    Object.entries(OFFICIAL_FILES).map(([key, file]) => {
      const url = new URL(
        `../../../packages/cards/data/decks/${file}`,
        import.meta.url,
      );
      const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
      if (!deck) throw new Error(`${file} has no deck`);
      return [key, deck];
    }),
  );
  const deck = officialDecks.get(set);
  if (!deck) throw new Error(`No official deck for ${set}`);
  return deck;
}

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

/**
 * How random players pick actions. `uniform`: any legal action with equal chance. `weighted`:
 * first an action type by weight, then a uniform pick within it. It favors battle plays and rage
 * and rarely invades. Battle cards go to its own empty zone 8 first (a zone 8 blocker stops the
 * opponent's invasion win), then to empty zones behind its own monster, where they are not
 * crushed (11.3.3), so counter power builds up and counters (5.15) happen often.
 */
export type Policy = "uniform" | "weighted";

export { POLICY_WEIGHTS } from "@gojisim/bot";

/**
 * Picks an action for the deciding player. `uniform`: any legal action with equal chance.
 * `weighted`: the `@gojisim/bot` weighted policy, which reads only the player's view.
 */
export function chooseAction(
  state: GameState,
  options: Action[],
  policy: Policy,
  pick: (n: number) => number,
): Action {
  if (policy === "uniform") return options[pick(options.length)] as Action;
  const decider = state.pendingChoice?.player ?? state.turnPlayer;
  return weightedChoice(getPlayerView(state, decider), options, pick);
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
  policy: Policy = "uniform",
  deckSource: DeckSource = "random",
  pairings: readonly (readonly [string, string])[] = PAIRINGS,
  fileDecks: readonly NamedDeck[] = [],
): GameOutcome {
  const seed = `${runSeed}-${game}`;
  const [setA, setB] = pairings[game % pairings.length] as readonly [
    string,
    string,
  ];
  const fromFile = filePairing(game, Math.max(1, fileDecks.length));
  const decks = [setA, setB].map((set, i) => {
    const deck =
      deckSource === "file"
        ? (fileDecks[fromFile[i] as number] as NamedDeck)
        : deckSource === "official"
          ? officialDeck(set)
          : buildTestDeck(set, `${seed}-P${i + 1}`);
    return {
      id: `P${i + 1}`,
      monsterDeck: deck.monsterDeck,
      mainDeck: deck.mainDeck,
    };
  }) as GameRecord["decks"];
  const record: GameRecord = {
    version: 1,
    seed,
    decks,
    actions: [],
    deckLegality: deckLegalityFor(decks, new Date()),
  };
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
    const action = chooseAction(state, options, policy, pick);
    record.actions.push(action);
    try {
      state = advanceToDecision(applyAction(state, action));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return outcome(state, {
        // The M12 guard (decision 150): name it, so it can't be mistaken for another crash.
        reason: message.includes(REPLACEMENT_ORDER_IN_RULE_ACTION)
          ? "M12: 2 or more replacements in a rule action (10.9.2.1 order choice not built)"
          : "engine threw",
        problems: [
          err instanceof Error ? (err.stack ?? err.message) : String(err),
        ],
        atAction: record.actions.length,
      });
    }
  }
}
