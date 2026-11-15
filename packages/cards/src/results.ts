/**
 * #340: the results page's data, stored on the server and never in the repo: what each bot change
 * did, deck by deck (`checks`, paired A/B checks, with the mistakes each fix targets), and field
 * runs (`runs`, every deck against every other). Aggregates and deck names only: no decklists,
 * game records, seeds or tester text.
 */

/** One deck's numbers in a check: A is the bot before the change, B after. */
export interface CheckDeck {
  deck: string;
  /** Games per arm. */
  games: number;
  aWins: number;
  bWins: number;
  /** Optional extra measures, A then B. */
  invasionsPerGame?: [number, number];
  countersPerGame?: [number, number];
  msMedian?: [number, number];
  msP95?: [number, number];
}

/**
 * A fix's mistake, counted in both arms (Paul, Nov 14): how often the bot made it, per game or per
 * chance to make it (e.g. turns with a reachable counter).
 */
export interface Mistake {
  /** The mistake in plain words ("missed a reachable counter"). */
  name: string;
  /** The tester issues that reported it ("#324"). */
  issues: string[];
  /** The deck it was counted on, or all the check's decks. */
  deck?: string;
  /** What `of` counts: games, or chances to make the mistake. */
  per: "games" | "chances";
  a: { count: number; of: number };
  b: { count: number; of: number };
}

/** One A/B check of a bot change. */
export interface Check {
  id: string;
  /** ISO date, e.g. "2026-11-14". */
  date: string;
  /** The change in plain words. */
  change: string;
  /** The PR ("#320") or branch, when there is one. */
  pr?: string;
  commit?: string;
  level: "Hard" | "Medium";
  /** How the seeds were paired, in plain words ("paired, same seeds in both arms"). */
  seeds: string;
  decks: CheckDeck[];
  mistakes?: Mistake[];
}

/** One cell of a field run: the row deck's wins against the column deck. */
export interface RunCell {
  row: string;
  column: string;
  wins: number;
  games: number;
  /** Paul, Nov 14: the community's read of this matchup, when there is one. */
  playersSay?: { read: "favoured" | "even" | "unfavoured"; source: string };
}

/** A field run (every deck against every other). */
export interface Run {
  id: string;
  date: string;
  name: string;
  commit?: string;
  /** The plan versions in force, in plain words. */
  plans: string;
  cells: RunCell[];
}

export interface ResultsData {
  checks: Check[];
  runs: Run[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isPair = (v: unknown) =>
  v === undefined ||
  (Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n)));
const isDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v: unknown) => typeof v === "string" && v.trim() !== "";

/**
 * The problems with a results file, empty when it's valid: the shape, wins within games, and
 * unique ids. Fields that would carry private data (lists, seeds, records) aren't allowed.
 */
export function validateResults(data: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(data)) return ["not an object"];
  const { checks, runs } = data;
  if (!Array.isArray(checks)) problems.push("checks is not a list");
  if (!Array.isArray(runs)) problems.push("runs is not a list");
  const ids = new Set<string>();
  const unique = (where: string, id: unknown) => {
    if (!text(id)) problems.push(`${where}: no id`);
    else if (ids.has(id as string))
      problems.push(`${where}: id ${String(id)} twice`);
    else ids.add(id as string);
  };
  const allowed = (
    where: string,
    o: Record<string, unknown>,
    keys: string[],
  ) => {
    for (const k of Object.keys(o))
      if (!keys.includes(k)) problems.push(`${where}: unknown field ${k}`);
  };
  for (const [i, c] of (Array.isArray(checks) ? checks : []).entries()) {
    const where = `checks[${i}]`;
    if (!isObject(c)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    allowed(where, c, [
      "id",
      "date",
      "change",
      "pr",
      "commit",
      "level",
      "seeds",
      "decks",
      "mistakes",
    ]);
    unique(where, c["id"]);
    if (!isDate(c["date"])) problems.push(`${where}: bad date`);
    if (!text(c["change"])) problems.push(`${where}: no change`);
    if (c["level"] !== "Hard" && c["level"] !== "Medium")
      problems.push(`${where}: level is Hard or Medium`);
    if (!text(c["seeds"])) problems.push(`${where}: no seeds note`);
    if (!Array.isArray(c["decks"]) || c["decks"].length === 0)
      problems.push(`${where}: no decks`);
    for (const [j, d] of (Array.isArray(c["decks"])
      ? c["decks"]
      : []
    ).entries()) {
      const at = `${where}.decks[${j}]`;
      if (!isObject(d)) {
        problems.push(`${at}: not an object`);
        continue;
      }
      allowed(at, d, [
        "deck",
        "games",
        "aWins",
        "bWins",
        "invasionsPerGame",
        "countersPerGame",
        "msMedian",
        "msP95",
      ]);
      if (!text(d["deck"])) problems.push(`${at}: no deck name`);
      if (!isCount(d["games"]) || d["games"] === 0)
        problems.push(`${at}: bad games`);
      for (const k of ["aWins", "bWins"])
        if (!isCount(d[k]) || (d[k] as number) > (d["games"] as number))
          problems.push(`${at}: ${k} not within games`);
      for (const k of [
        "invasionsPerGame",
        "countersPerGame",
        "msMedian",
        "msP95",
      ])
        if (!isPair(d[k])) problems.push(`${at}: ${k} is not [A, B]`);
    }
  }
  for (const [i, c] of (Array.isArray(checks) ? checks : []).entries()) {
    if (!isObject(c) || c["mistakes"] === undefined) continue;
    if (!Array.isArray(c["mistakes"])) {
      problems.push(`checks[${i}]: mistakes is not a list`);
      continue;
    }
    for (const [j, m] of c["mistakes"].entries()) {
      const at = `checks[${i}].mistakes[${j}]`;
      if (!isObject(m)) {
        problems.push(`${at}: not an object`);
        continue;
      }
      allowed(at, m, ["name", "issues", "deck", "per", "a", "b"]);
      if (!text(m["name"])) problems.push(`${at}: no name`);
      if (
        !Array.isArray(m["issues"]) ||
        !m["issues"].every((x) => typeof x === "string" && /^#\d+$/.test(x))
      )
        problems.push(`${at}: issues are "#N"`);
      if (m["deck"] !== undefined && !text(m["deck"]))
        problems.push(`${at}: empty deck`);
      if (m["per"] !== "games" && m["per"] !== "chances")
        problems.push(`${at}: per is games or chances`);
      for (const arm of ["a", "b"]) {
        const v = m[arm];
        if (
          !isObject(v) ||
          !isCount(v["count"]) ||
          !isCount(v["of"]) ||
          (m["per"] === "chances" &&
            (v["count"] as number) > (v["of"] as number))
        )
          problems.push(`${at}: ${arm} is { count, of }`);
      }
    }
  }
  for (const [i, r] of (Array.isArray(runs) ? runs : []).entries()) {
    const where = `runs[${i}]`;
    if (!isObject(r)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    allowed(where, r, ["id", "date", "name", "commit", "plans", "cells"]);
    unique(where, r["id"]);
    if (!isDate(r["date"])) problems.push(`${where}: bad date`);
    if (!text(r["name"])) problems.push(`${where}: no name`);
    if (!text(r["plans"])) problems.push(`${where}: no plans note`);
    for (const [j, cell] of (Array.isArray(r["cells"])
      ? r["cells"]
      : []
    ).entries()) {
      const at = `${where}.cells[${j}]`;
      if (!isObject(cell)) {
        problems.push(`${at}: not an object`);
        continue;
      }
      allowed(at, cell, ["row", "column", "wins", "games", "playersSay"]);
      const say = cell["playersSay"];
      if (
        say !== undefined &&
        (!isObject(say) ||
          !["favoured", "even", "unfavoured"].includes(say["read"] as string) ||
          !text(say["source"]))
      )
        problems.push(`${at}: playersSay is { read, source }`);
      if (!text(cell["row"]) || !text(cell["column"]))
        problems.push(`${at}: no deck names`);
      if (!isCount(cell["games"]) || cell["games"] === 0)
        problems.push(`${at}: bad games`);
      if (
        !isCount(cell["wins"]) ||
        (cell["wins"] as number) > (cell["games"] as number)
      )
        problems.push(`${at}: wins not within games`);
    }
  }
  return problems;
}

/** A win rate with its 95% range (Wilson score interval), all as fractions. */
export function winRange(
  wins: number,
  games: number,
): {
  rate: number;
  low: number;
  high: number;
} {
  if (games === 0) return { rate: 0, low: 0, high: 0 };
  const z = 1.96;
  const p = wins / games;
  const denominator = 1 + (z * z) / games;
  const centre = (p + (z * z) / (2 * games)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) /
    denominator;
  return {
    rate: p,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  };
}

/**
 * Better, level or worse: B's win rate against A's, judged by whether the 95% range of the
 * difference (normal approximation) leaves zero.
 */
export function verdict(
  d: Pick<CheckDeck, "aWins" | "bWins" | "games">,
): "better" | "level" | "worse" {
  const n = d.games;
  if (n === 0) return "level";
  const a = d.aWins / n;
  const b = d.bWins / n;
  const se = Math.sqrt((a * (1 - a)) / n + (b * (1 - b)) / n);
  const diff = b - a;
  if (se === 0) return diff > 0 ? "better" : diff < 0 ? "worse" : "level";
  if (diff - 1.96 * se > 0) return "better";
  if (diff + 1.96 * se < 0) return "worse";
  return "level";
}

/**
 * A mistake's rate per 100 games or chances, with its 95% range: Wilson's for chances (at most
 * one each), a Poisson normal range for games (a game can hold several).
 */
export function mistakeRate(
  m: Pick<Mistake, "per">,
  arm: { count: number; of: number },
): { rate: number; low: number; high: number } {
  if (arm.of === 0) return { rate: 0, low: 0, high: 0 };
  if (m.per === "chances") {
    const r = winRange(arm.count, arm.of);
    return { rate: r.rate * 100, low: r.low * 100, high: r.high * 100 };
  }
  const rate = (arm.count / arm.of) * 100;
  const half = (1.96 * Math.sqrt(arm.count) * 100) / arm.of;
  return { rate, low: Math.max(0, rate - half), high: rate + half };
}

/**
 * Better, level or worse for a mistake (fewer is better): the 95% range of B's rate minus A's.
 */
export function mistakeVerdict(m: Mistake): "better" | "level" | "worse" {
  const a = mistakeRate(m, m.a);
  const b = mistakeRate(m, m.b);
  // Each range's half width stands in for 1.96 standard errors.
  const se = Math.sqrt(
    ((a.high - a.low) / 3.92) ** 2 + ((b.high - b.low) / 3.92) ** 2,
  );
  const diff = b.rate - a.rate;
  if (se === 0) return diff < 0 ? "better" : diff > 0 ? "worse" : "level";
  if (diff + 1.96 * se < 0) return "better";
  if (diff - 1.96 * se > 0) return "worse";
  return "level";
}

/** The guide decks the page shows by default (#340); others are behind "show all". */
export const GUIDE_DECKS = [
  "Wrangler",
  "Despangler",
  "Tangler",
  "Ghidorat",
  "Monster X",
  "Red Fest",
  "SpaceG T7",
];

/** Whether a deck name belongs to a guide deck (its name starts with one). */
export const isGuideDeck = (deck: string) =>
  GUIDE_DECKS.some((g) => deck === g || deck.startsWith(`${g} `));
