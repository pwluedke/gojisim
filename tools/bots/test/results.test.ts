import { validateResults } from "@gojisim/cards/results";
import { describe, expect, it } from "vitest";
import {
  checkDecks,
  checkEntry,
  mistakesByDeck,
  type PlanReport,
  runCells,
  runEntry,
} from "../src/results";

/** #340: made-up plan reports (real results live on the server only). */
function report(winners: ("a" | "b")[], msA = 100): PlanReport {
  return {
    games: winners.map((winner, game) => ({
      game,
      winner,
      decisions: { a: 10, b: 10 },
      ms: { a: msA * 10 * (game + 1), b: 1000 },
    })),
  };
}

const label = (deck: string) =>
  ({ alpha: "Alpha (sample)", beta: "Beta (sample)" })[deck] ?? deck;

describe("#340 results entries from plan reports", () => {
  it("a check's decks: A deck by A deck, wins in each arm, only matchups both arms have, no mirrors, cut to the first N games", () => {
    const a = {
      "alpha-vs-beta": report(["a", "b", "b", "a"]),
      "alpha-vs-gamma": report(["a", "a", "b", "b"]),
      "beta-vs-alpha": report(["b", "b", "b", "b"]),
      "only-in-a": report(["a"]),
      "alpha-vs-alpha": report(["a", "a", "a"]),
    };
    const b = {
      "alpha-vs-beta": report(["a", "a", "a", "b"], 200),
      "alpha-vs-gamma": report(["a", "a", "a", "a"], 200),
      "beta-vs-alpha": report(["a", "b", "b", "b"]),
      "alpha-vs-alpha": report(["b", "b", "b"]),
    };
    const decks = checkDecks(a, b, label, { first: 3 });
    expect(decks.map((d) => d.deck)).toEqual([
      "Alpha (sample)",
      "Beta (sample)",
    ]);
    const alpha = decks[0]!;
    // Games 0-2 of each matchup: A arm 1 + 2 wins, B arm 3 + 3.
    expect(alpha).toMatchObject({ games: 6, aWins: 3, bWins: 6 });
    // ms per decision: A seat's ms / decisions per game (100, 200, 300 vs 200, 400, 600).
    expect(alpha.msMedian).toEqual([200, 400]);
    expect(alpha.msP95).toEqual([300, 600]);
    expect(decks[1]).toMatchObject({ games: 3, aWins: 0, bWins: 1 });
    const entry = checkEntry(
      {
        id: "sample",
        date: "2026-01-10",
        change: "Sample",
        level: "Hard",
        seeds: "paired",
      },
      decks,
    );
    expect(validateResults({ checks: [entry.check], runs: [] })).toEqual([]);
  });

  it("a run's cells: each matchup in both directions, under the labels", () => {
    const cells = runCells({ "alpha-vs-beta": report(["a", "a", "b"]) }, label);
    expect(cells).toEqual([
      { row: "Alpha (sample)", column: "Beta (sample)", wins: 2, games: 3 },
      { row: "Beta (sample)", column: "Alpha (sample)", wins: 1, games: 3 },
    ]);
    const entry = runEntry(
      { id: "r", date: "2026-01-10", name: "Sample run", plans: "sample" },
      cells,
    );
    expect(validateResults({ checks: [], runs: [entry.run] })).toEqual([]);
  });

  it("a mistake's counts summed per A deck, mirrors left out, as Check.mistakes", () => {
    const mistakes = mistakesByDeck(
      {
        "alpha-vs-beta": {
          a: { count: 3, of: 20 },
          b: { count: 1, of: 18 },
        },
        "alpha-vs-gamma": {
          a: { count: 2, of: 10 },
          b: { count: 0, of: 12 },
        },
        "alpha-vs-alpha": {
          a: { count: 9, of: 9 },
          b: { count: 9, of: 9 },
        },
      },
      label,
      { name: "missed a reachable counter", issues: ["#324"], per: "chances" },
    );
    expect(mistakes).toEqual([
      {
        name: "missed a reachable counter",
        issues: ["#324"],
        per: "chances",
        deck: "Alpha (sample)",
        a: { count: 5, of: 30 },
        b: { count: 1, of: 30 },
      },
    ]);
  });
});
