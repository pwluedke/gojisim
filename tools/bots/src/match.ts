import {
  type Bot,
  type BotSettings,
  botInput,
  decklistsOf,
  seededRng,
} from "@gojisim/bot";
import { buildTestDeck } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { officialDeck } from "@gojisim/stress";

export type DeckSource = "official" | "random";

/** A game still running at this turn ends unfinished (counted as a draw). */
export const MATCH_TURN_CAP = 500;

export interface SeatedBot {
  bot: Bot;
  settings?: BotSettings;
}

export interface GameResult {
  game: number;
  seed: string;
  /** Bot a's seat (seats alternate game by game). */
  aSeat: "P1" | "P2";
  /** The sets P1 and P2 played. */
  decks: [string, string];
  winner: "a" | "b" | null;
  reason: string;
  turns: number;
  decisions: { a: number; b: number };
  /** Milliseconds spent in `chooseAction`. */
  ms: { a: number; b: number };
}

/**
 * Decks for one game: the sets alternate every 2 games, so with alternating seats each bot plays
 * each set from each seat.
 */
function decksFor(
  seed: string,
  game: number,
  source: DeckSource,
): [PlayerSetup, PlayerSetup] {
  const sets =
    Math.floor(game / 2) % 2 === 0 ? ["ESD01", "ESD02"] : ["ESD02", "ESD01"];
  return sets.map((set, i) => {
    const deck =
      source === "official"
        ? officialDeck(set)
        : buildTestDeck(set, `${seed}-${game}-P${i + 1}`);
    return {
      id: `P${i + 1}`,
      monsterDeck: deck.monsterDeck,
      mainDeck: deck.mainDeck,
    };
  }) as [PlayerSetup, PlayerSetup];
}

/** Plays one game between two bots, each deciding only from its own `BotInput`. */
export function playMatchGame(
  a: SeatedBot,
  b: SeatedBot,
  runSeed: string,
  game: number,
  source: DeckSource,
  turnCap = MATCH_TURN_CAP,
): GameResult {
  const seed = `${runSeed}-${game}`;
  const aSeat = game % 2 === 0 ? "P1" : "P2";
  const decks = decksFor(runSeed, game, source);
  const lists = decklistsOf(decks);
  const seats = {
    [aSeat]: { side: "a" as const, ...a, rng: seededRng(`${seed}-a`) },
    [aSeat === "P1" ? "P2" : "P1"]: {
      side: "b" as const,
      ...b,
      rng: seededRng(`${seed}-b`),
    },
  };
  const result: GameResult = {
    game,
    seed,
    aSeat,
    decks: (Math.floor(game / 2) % 2 === 0
      ? ["ESD01", "ESD02"]
      : ["ESD02", "ESD01"]) as [string, string],
    winner: null,
    reason: "unfinished",
    turns: 0,
    decisions: { a: 0, b: 0 },
    ms: { a: 0, b: 0 },
  };
  let state: GameState = advanceToDecision(startGame({ seed, decks }));
  while (state.result === null && state.turn <= turnCap) {
    const decider = state.pendingChoice?.player ?? state.turnPlayer;
    const seat = seats[decider];
    if (!seat) throw new Error(`No bot for ${decider}`);
    const input = botInput(
      state,
      decider,
      lists,
      seat.rng,
      seat.settings ?? {},
    );
    const start = performance.now();
    const action = seat.bot.chooseAction(input);
    result.ms[seat.side] += performance.now() - start;
    result.decisions[seat.side]++;
    const legal = getLegalActions(state, decider).some(
      (l) => JSON.stringify(l) === JSON.stringify(action),
    );
    if (!legal)
      throw new Error(
        `${seat.bot.name} chose an illegal action ${JSON.stringify(action)} (game ${game}, step ${state.step})`,
      );
    state = advanceToDecision(applyAction(state, action));
  }
  result.turns = state.turn;
  if (state.result) {
    result.reason = state.result.reason;
    result.winner =
      state.result.winner === null
        ? null
        : state.result.winner === aSeat
          ? "a"
          : "b";
  }
  return result;
}

/** Wilson score interval for a proportion, 95% (z = 1.96). */
export function wilson(
  successes: number,
  n: number,
  z = 1.96,
): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export interface MatchSummary {
  a: string;
  b: string;
  games: number;
  seed: string;
  decks: DeckSource;
  /** Search bots ran without a time budget, so the run depends only on its seed. */
  deterministic?: boolean;
  wins: { a: number; b: number; draws: number };
  winRate: {
    a: { rate: number; ci95: [number, number] };
    b: { rate: number; ci95: [number, number] };
  };
  winReasons: Record<string, number>;
  averageTurns: number;
  msPerDecision: { a: number; b: number };
}

export function summarize(
  a: Bot,
  b: Bot,
  seed: string,
  decks: DeckSource,
  results: GameResult[],
): MatchSummary {
  const n = results.length;
  const wins = {
    a: results.filter((r) => r.winner === "a").length,
    b: results.filter((r) => r.winner === "b").length,
    draws: results.filter((r) => r.winner === null).length,
  };
  const reasons: Record<string, number> = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const round = (x: number, d = 3) => Number(x.toFixed(d));
  const rate = (w: number) => ({
    rate: round(n ? w / n : 0),
    ci95: wilson(w, n).map((x) => round(x)) as [number, number],
  });
  const per = (side: "a" | "b") => {
    const decisions = results.reduce((s, r) => s + r.decisions[side], 0);
    const ms = results.reduce((s, r) => s + r.ms[side], 0);
    return round(decisions ? ms / decisions : 0, 4);
  };
  return {
    a: a.name,
    b: b.name,
    games: n,
    seed,
    decks,
    wins,
    winRate: { a: rate(wins.a), b: rate(wins.b) },
    winReasons: reasons,
    averageTurns: round(
      n ? results.reduce((s, r) => s + r.turns, 0) / n : 0,
      2,
    ),
    msPerDecision: { a: per("a"), b: per("b") },
  };
}
