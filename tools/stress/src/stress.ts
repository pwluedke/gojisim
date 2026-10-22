import { readFileSync } from "node:fs";
import { type NamedDeck, parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck } from "@gojisim/cards/test-decks";
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
  REPLACEMENT_ORDER_IN_RULE_ACTION,
  type LoopReport,
  type ZoneNumber,
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

/** Where decks come from: `random` test decks (`buildTestDeck`) or the `official` starter lists. */
export type DeckSource = "random" | "official";

const OFFICIAL_FILES: Record<string, string> = {
  ESD01: "esd01-starter.txt",
  ESD02: "esd02-starter.txt",
};

let officialDecks: Map<string, NamedDeck> | null = null;

/** The official starter deck of a set, from `packages/cards/data/decks/`. */
function officialDeck(set: string): NamedDeck {
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

export const POLICY_WEIGHTS: Record<Action["type"], number> = {
  playBattle: 32,
  gainRage: 20,
  playMonster: 12,
  activateStrategy: 8,
  pass: 8,
  invade: 1,
  choose: 4,
  concede: 0,
};

/** Whether a player's zone holds a battle card (a stack topped by one). */
function hasBattleCard(
  state: GameState,
  playerId: string,
  zone: ZoneNumber,
): boolean {
  const player = state.players.find((p) => p.id === playerId);
  return (player?.zones[zone] ?? []).some((stack) => {
    const top = stack[stack.length - 1];
    return top !== undefined && state.cards[top.cardId]?.type === "Battle";
  });
}

export function chooseAction(
  state: GameState,
  options: Action[],
  policy: Policy,
  pick: (n: number) => number,
): Action {
  if (policy === "uniform") return options[pick(options.length)] as Action;
  const types = [...new Set(options.map((a) => a.type))];
  const weights = types.map((t) => POLICY_WEIGHTS[t]);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = pick(total);
  const type = types.find(
    (_, i) => (roll -= weights[i] as number) < 0,
  ) as Action["type"];
  const ofType = options.filter((a) => a.type === type);
  const battles = ofType.filter((a) => a.type === "playBattle");
  if (battles.length === 0) return ofType[pick(ofType.length)] as Action;
  const playerId = battles[0]?.player ?? "";
  const own =
    state.players.find((p) => p.id === playerId)?.monsterPosition ?? 1;
  // A battle card in your own zone 8 blocks the opponent's victory through invasion
  // (5.13.1.1.1), so fill an empty zone 8 first. Your own monster crushes it (11.3.3) when it
  // reaches zone 8 at an end phase (7.5.2).
  const toZone8 = battles.filter((a) => a.zone === 8);
  if (toZone8.length > 0 && !hasBattleCard(state, playerId, 8))
    return toZone8[pick(toZone8.length)] as Action;
  // Otherwise prefer an empty zone behind your own monster: it only advances (7.5.2), so a
  // battle card there is not crushed and keeps adding counter power (7.4.2).
  const safe = battles.filter(
    (a) => a.zone < own && !hasBattleCard(state, playerId, a.zone),
  );
  const pool = safe.length > 0 ? safe : battles;
  return pool[pick(pool.length)] as Action;
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
): GameOutcome {
  const seed = `${runSeed}-${game}`;
  const [setA, setB] = PAIRINGS[game % PAIRINGS.length] as readonly [
    string,
    string,
  ];
  const decks = [setA, setB].map((set, i) => {
    const deck =
      deckSource === "official"
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
