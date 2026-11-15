import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isGuideDeck,
  mistakeRate,
  mistakeVerdict,
  validateResults,
  verdict,
  winRange,
} from "../src/results";

/** A made-up sample (#340: the real results live on the server, never in the repo). */
const sample = JSON.parse(
  readFileSync(new URL("./results-sample.json", import.meta.url), "utf8"),
) as unknown;

describe("#340 results data", () => {
  it("the made-up sample is valid", () => {
    expect(validateResults(sample)).toEqual([]);
  });

  it("finds a bad shape, wins over games, a repeated id and a field it doesn't know (no private data)", () => {
    expect(validateResults([])).toEqual(["not an object"]);
    const check = {
      id: "x",
      date: "2026-11-14",
      change: "Card rule 7",
      level: "Hard",
      seeds: "paired",
      decks: [{ deck: "Ghidorat", games: 10, aWins: 11, bWins: 3 }],
    };
    const problems = validateResults({
      checks: [check, { ...check, seed: "run-3" }],
      runs: [],
    });
    expect(problems).toContain("checks[0].decks[0]: aWins not within games");
    expect(problems).toContain("checks[1]: id x twice");
    expect(problems).toContain("checks[1]: unknown field seed");
  });

  it("a win rate's 95% range (Wilson) holds the rate and stays within 0-1", () => {
    const r = winRange(62, 100);
    expect(r.rate).toBeCloseTo(0.62);
    expect(r.low).toBeGreaterThan(0.52);
    expect(r.low).toBeLessThan(0.62);
    expect(r.high).toBeGreaterThan(0.62);
    expect(r.high).toBeLessThan(0.71);
    expect(winRange(0, 10).low).toBe(0);
    expect(winRange(10, 10).high).toBe(1);
  });

  it("better, level or worse from the paired result's 95% range", () => {
    expect(verdict({ games: 216, aWins: 128, bWins: 129 })).toBe("level");
    expect(verdict({ games: 216, aWins: 127, bWins: 149 })).toBe("better");
    expect(verdict({ games: 216, aWins: 149, bWins: 120 })).toBe("worse");
  });

  it("guide decks by name prefix; others are behind show all", () => {
    expect(isGuideDeck("Wrangler (generic)")).toBe(true);
    expect(isGuideDeck("Monster X")).toBe(true);
    expect(isGuideDeck("Sacred Moguera")).toBe(false);
  });

  it("a mistake's rate per 100 (chances: Wilson; games: Poisson) and its verdict, fewer being better", () => {
    const chances = mistakeRate({ per: "chances" }, { count: 30, of: 400 });
    expect(chances.rate).toBeCloseTo(7.5);
    expect(chances.low).toBeLessThan(7.5);
    expect(chances.high).toBeGreaterThan(7.5);
    const games = mistakeRate({ per: "games" }, { count: 45, of: 200 });
    expect(games.rate).toBeCloseTo(22.5);
    const fix = {
      name: "x",
      issues: ["#1"],
      per: "games" as const,
      a: { count: 45, of: 200 },
      b: { count: 10, of: 200 },
    };
    expect(mistakeVerdict(fix)).toBe("better");
    expect(mistakeVerdict({ ...fix, b: { count: 44, of: 200 } })).toBe("level");
    expect(mistakeVerdict({ ...fix, a: fix.b, b: fix.a })).toBe("worse");
  });

  it("finds a bad mistake entry and a bad players' read", () => {
    const problems = validateResults({
      checks: [
        {
          id: "x",
          date: "2026-01-10",
          change: "c",
          level: "Hard",
          seeds: "s",
          decks: [{ deck: "d", games: 1, aWins: 0, bWins: 1 }],
          mistakes: [
            {
              name: "m",
              issues: ["317"],
              per: "chances",
              a: { count: 5, of: 2 },
              b: { count: 0, of: 2 },
            },
          ],
        },
      ],
      runs: [
        {
          id: "r",
          date: "2026-01-10",
          name: "n",
          plans: "p",
          cells: [
            {
              row: "a",
              column: "b",
              wins: 1,
              games: 2,
              playersSay: { read: "likely", source: "" },
            },
          ],
        },
      ],
    });
    expect(problems).toContain('checks[0].mistakes[0]: issues are "#N"');
    expect(problems).toContain("checks[0].mistakes[0]: a is { count, of }");
    expect(problems).toContain(
      "runs[0].cells[0]: playersSay is { read, source }",
    );
  });
});
