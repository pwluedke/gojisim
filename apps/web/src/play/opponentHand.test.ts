import { describe, expect, it } from "vitest";
import { handRowFits } from "./OpponentHand";

describe("bot hand row: when the overlapping row fits (else one card with the count)", () => {
  it("the first card is whole and each next one adds a sixth of a card", () => {
    // 30 px cards: 1 card 30, 4 cards 30 + 3 × 5 = 45.
    expect(handRowFits(1, 30, 30)).toBe(true);
    expect(handRowFits(4, 45, 30)).toBe(true);
    expect(handRowFits(5, 45, 30)).toBe(false);
  });

  it("an empty hand always fits; a space narrower than one card fits none", () => {
    expect(handRowFits(0, 0, 30)).toBe(true);
    expect(handRowFits(1, 29, 30)).toBe(false);
  });

  it("sub-pixel widths don't flip the row at the edge", () => {
    expect(handRowFits(4, 44.6, 30)).toBe(true);
    expect(handRowFits(4, 44.4, 30)).toBe(false);
  });
});
