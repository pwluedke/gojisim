import type { GameResult } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import {
  GAME_OVER_LINES,
  type OutcomeKey,
  outcomeHeading,
  outcomeKey,
  pickLine,
} from "./gameOver";

const result = (
  winner: string | null,
  reason: GameResult["reason"],
): GameResult => ({ winner, reason, rule: "1.2" });

describe("game-over modal lines (M5h #17)", () => {
  it.each([
    [result("P1", "invasion"), "winInvasion"],
    [result("P1", "victoryThroughCountering"), "winCounter"],
    [result("P1", "concession"), "winConcede"],
    [result("P1", "effect"), "winEffect"],
    [result("P2", "invasion"), "lossInvasion"],
    [result("P2", "victoryThroughCountering"), "lossCounter"],
    [result("P2", "concession"), "lossConcede"],
    [result("P2", "effect"), "lossEffect"],
    [result(null, "draw"), "draw"],
  ] as const)("%o is %s for P1", (r, key) => {
    expect(outcomeKey(r, "P1")).toBe(key);
  });

  it("every outcome key shows a line from its own list, about 10 per key", () => {
    for (const key of Object.keys(GAME_OVER_LINES) as OutcomeKey[]) {
      const lines = GAME_OVER_LINES[key];
      expect(lines.length).toBeGreaterThanOrEqual(10);
      for (let i = 0; i < 20; i++) expect(lines).toContain(pickLine(key, null));
      expect(outcomeHeading(key)).not.toBe("");
    }
  });

  it("keeps Paul's starter lines", () => {
    expect(GAME_OVER_LINES.winInvasion).toContain(
      "Tokyo is yours. Property values are not.",
    );
    expect(GAME_OVER_LINES.lossConcede).toContain(
      "You conceded. Godzilla would never.",
    );
    expect(GAME_OVER_LINES.lossTimer).toContain(
      "Time's up. The kaiju got bored and left.",
    );
  });

  it("never picks the same line twice in a row", () => {
    let last: string | null = null;
    for (let i = 0; i < 200; i++) {
      const line = pickLine("lossInvasion", last);
      expect(line).not.toBe(last);
      last = line;
    }
    // Even when the random pick lands on the last line's slot.
    const first = GAME_OVER_LINES.winConcede[0] ?? "";
    expect(pickLine("winConcede", first, () => 0)).not.toBe(first);
  });

  it("headings say who won and how", () => {
    expect(outcomeHeading("winInvasion")).toBe(
      "You win: victory through invasion",
    );
    expect(outcomeHeading("lossConcede")).toBe("You lose: concession");
    expect(outcomeHeading("draw")).toBe("Draw");
  });
});
