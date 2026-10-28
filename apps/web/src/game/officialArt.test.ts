import { describe, expect, it } from "vitest";
import { FIRST_SECOND_ART, firstSecondArt } from "./officialArt";

describe("official First / Second art (Tester fixes 1)", () => {
  it("the game's seed fixes which First and which Second front show", () => {
    for (const seed of [0, 1, 7, 42, 123456789])
      expect(firstSecondArt(seed)).toEqual(firstSecondArt(seed));
    const art = firstSecondArt(42);
    expect(FIRST_SECOND_ART.First).toContain(art.First);
    expect(FIRST_SECOND_ART.Second).toContain(art.Second);
  });

  it("across seeds, every front shows", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const art = firstSecondArt(seed);
      seen.add(art.First).add(art.Second);
    }
    expect([...seen].sort()).toEqual(
      [...FIRST_SECOND_ART.First, ...FIRST_SECOND_ART.Second].sort(),
    );
  });
});
