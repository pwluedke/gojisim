import type {
  Check,
  CheckDeck,
  Mistake,
  Run,
  RunCell,
} from "@gojisim/cards/results";

/*
 * #340: a finished check's or run's plan reports (`bot-reports/plans/<name>/<matchup>.json`) as a
 * results entry, for the results page. Aggregates only: wins, games and the extra measures, under
 * the deck labels given (a report's deck names can carry a tester's name, so they're never used).
 */

/** The parts of a plan report this reads. */
export interface PlanReport {
  games: {
    game: number;
    winner: "a" | "b" | null;
    decisions: { a: number; b: number };
    ms: { a: number; b: number };
  }[];
}

/** A matchup id's deck: the part before `-vs-` (the A deck) or after it. */
export const sideOf = (id: string, side: "a" | "b") =>
  (side === "a" ? id.split("-vs-")[0] : id.split("-vs-")[1]) ?? id;

/** A report's games 0 to `first` - 1 (all of them without `first`), in game order. */
const firstGames = (r: PlanReport, first?: number) =>
  [...r.games]
    .sort((x, y) => x.game - y.game)
    .filter((g) => first === undefined || g.game < first);

/** The value at fraction `q` of sorted numbers (nearest rank). */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const i = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, i)] as number;
}

/** The A seat's ms per decision in each game. */
const msPerDecision = (games: PlanReport["games"]) =>
  games.filter((g) => g.decisions.a > 0).map((g) => g.ms.a / g.decisions.a);

/**
 * A check entry's decks from its two arms' reports (A: before the change, B: after), grouped by
 * the A deck. Only the matchups both arms have count, each cut to its first `first` games, so the
 * comparison stays paired; mirrors (a deck against itself) are left out, as the reports do.
 */
export function checkDecks(
  a: Record<string, PlanReport>,
  b: Record<string, PlanReport>,
  label: (deck: string) => string,
  options: { first?: number } = {},
): CheckDeck[] {
  const decks = new Map<
    string,
    {
      games: number;
      aWins: number;
      bWins: number;
      msA: number[];
      msB: number[];
    }
  >();
  for (const id of Object.keys(a).sort()) {
    const ra = a[id];
    const rb = b[id];
    if (!ra || !rb || sideOf(id, "a") === sideOf(id, "b")) continue;
    const ga = firstGames(ra, options.first);
    const gb = firstGames(rb, options.first);
    const n = Math.min(ga.length, gb.length);
    const name = label(sideOf(id, "a"));
    const d = decks.get(name) ?? {
      games: 0,
      aWins: 0,
      bWins: 0,
      msA: [],
      msB: [],
    };
    d.games += n;
    d.aWins += ga.slice(0, n).filter((g) => g.winner === "a").length;
    d.bWins += gb.slice(0, n).filter((g) => g.winner === "a").length;
    d.msA.push(...msPerDecision(ga.slice(0, n)));
    d.msB.push(...msPerDecision(gb.slice(0, n)));
    decks.set(name, d);
  }
  const round = (x: number, places: number) =>
    Math.round(x * 10 ** places) / 10 ** places;
  return [...decks.entries()].map(([deck, d]) => ({
    deck,
    games: d.games,
    aWins: d.aWins,
    bWins: d.bWins,
    ...(d.msA.length > 0 && d.msB.length > 0
      ? {
          msMedian: [
            round(quantile(d.msA, 0.5), 0),
            round(quantile(d.msB, 0.5), 0),
          ] as [number, number],
          msP95: [
            round(quantile(d.msA, 0.95), 0),
            round(quantile(d.msB, 0.95), 0),
          ] as [number, number],
        }
      : {}),
  }));
}

/**
 * A mistake's counts per A deck, from per-matchup counts in each arm (mirrors left out), for
 * `Check.mistakes`.
 */
export function mistakesByDeck(
  counts: Record<
    string,
    { a: { count: number; of: number }; b: { count: number; of: number } }
  >,
  label: (deck: string) => string,
  mistake: Pick<Mistake, "name" | "issues" | "per">,
): Mistake[] {
  const decks = new Map<string, Mistake>();
  for (const id of Object.keys(counts).sort()) {
    const c = counts[id];
    if (!c || sideOf(id, "a") === sideOf(id, "b")) continue;
    const deck = label(sideOf(id, "a"));
    const m = decks.get(deck) ?? {
      ...mistake,
      deck,
      a: { count: 0, of: 0 },
      b: { count: 0, of: 0 },
    };
    m.a = { count: m.a.count + c.a.count, of: m.a.of + c.a.of };
    m.b = { count: m.b.count + c.b.count, of: m.b.of + c.b.of };
    decks.set(deck, m);
  }
  return [...decks.values()];
}

/** A run's cells from its reports: each matchup gives both directions. */
export function runCells(
  reports: Record<string, PlanReport>,
  label: (deck: string) => string,
): RunCell[] {
  const cells: RunCell[] = [];
  for (const id of Object.keys(reports).sort()) {
    const r = reports[id];
    if (!r) continue;
    const games = r.games.length;
    const aWins = r.games.filter((g) => g.winner === "a").length;
    const bWins = r.games.filter((g) => g.winner === "b").length;
    const row = label(sideOf(id, "a"));
    const column = label(sideOf(id, "b"));
    cells.push({ row, column, wins: aWins, games });
    cells.push({ row: column, column: row, wins: bWins, games });
  }
  return cells;
}

/** A check entry. */
export const checkEntry = (
  fields: Omit<Check, "decks" | "mistakes">,
  decks: CheckDeck[],
  mistakes: Mistake[] = [],
): { check: Check } => ({
  check: { ...fields, decks, ...(mistakes.length > 0 ? { mistakes } : {}) },
});

/** A run entry. */
export const runEntry = (
  fields: Omit<Run, "cells">,
  cells: RunCell[],
): { run: Run } => ({ run: { ...fields, cells } });
