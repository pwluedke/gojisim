import { randomBot, weightedBot } from "@gojisim/bot";
import { describe, expect, it } from "vitest";
import { playMatchGame, summarize, wilson } from "../src/match";

describe("bot tournament harness (M6a)", () => {
  it("200 games of random vs weighted: every decision, of every choice kind, is answered with a legal action", () => {
    const results = Array.from({ length: 200 }, (_, game) =>
      playMatchGame(
        { bot: randomBot },
        { bot: weightedBot },
        "harness",
        game,
        game % 2 === 0 ? "official" : "random",
      ),
    );
    const summary = summarize(
      randomBot,
      weightedBot,
      "harness",
      "official",
      results,
    );
    expect(summary.games).toBe(200);
    expect(summary.wins.a + summary.wins.b + summary.wins.draws).toBe(200);
    // Seats alternate: each bot sat in P1 for half the games.
    expect(results.filter((r) => r.aSeat === "P1")).toHaveLength(100);
    expect(results.every((r) => r.reason !== "unfinished")).toBe(true);
  }, 120_000);

  it("the Wilson 95% interval brackets the rate", () => {
    const [low, high] = wilson(60, 100);
    expect(low).toBeCloseTo(0.502, 2);
    expect(high).toBeCloseTo(0.691, 2);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});
