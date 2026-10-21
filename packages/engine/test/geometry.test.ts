import { describe, expect, it } from "vitest";
import {
  behind,
  inFrontOf,
  isAdjacent,
  isBefore,
  isBeyond,
  isLeftOf,
  isRightOf,
  leftRightPosition,
  sameColumn,
  ZONE_NUMBERS,
  type ZoneNumber,
  type ZoneRef,
} from "../src";

const me = (zone: ZoneNumber): ZoneRef => ({ player: "me", zone });
const opp = (zone: ZoneNumber): ZoneRef => ({ player: "opp", zone });
const pairs = ZONE_NUMBERS.flatMap((a) =>
  ZONE_NUMBERS.map((b) => [a, b] as const),
);

describe("zone geometry (4.4.5)", () => {
  it("4.4.5.1 8 is in front of 3, 7 of 4, 6 of 5; other zones have nothing in front", () => {
    expect(ZONE_NUMBERS.map((z) => [z, inFrontOf(z)])).toEqual([
      [1, null],
      [2, null],
      [3, 8],
      [4, 7],
      [5, 6],
      [6, null],
      [7, null],
      [8, null],
    ]);
  });

  it("4.4.5.1 3 is behind 8, 4 behind 7, 5 behind 6 (the zones a countered monster moves to, 5.15.1.1)", () => {
    expect(ZONE_NUMBERS.map((z) => [z, behind(z)])).toEqual([
      [1, null],
      [2, null],
      [3, null],
      [4, null],
      [5, null],
      [6, 5],
      [7, 4],
      [8, 3],
    ]);
  });

  it("4.4.5.2 own zones are adjacent when numbers differ by 1 or one is in front of the other", () => {
    const adjacent = pairs.filter(([a, b]) => isAdjacent(me(a), me(b)));
    expect(adjacent).toEqual([
      [1, 2],
      [2, 1],
      [2, 3],
      [3, 2],
      [3, 4],
      [3, 8],
      [4, 3],
      [4, 5],
      [4, 7],
      [5, 4],
      [5, 6],
      [6, 5],
      [6, 7],
      [7, 4],
      [7, 6],
      [7, 8],
      [8, 3],
      [8, 7],
    ]);
  });

  it("4.4.5.2 my zone 8 and the opponent's zone 8 are adjacent; no other cross-player pair is", () => {
    const adjacent = pairs.filter(([a, b]) => isAdjacent(me(a), opp(b)));
    expect(adjacent).toEqual([[8, 8]]);
    expect(isAdjacent(opp(8), me(8))).toBe(true);
  });

  it("4.4.5.2 a zone is not adjacent to itself", () => {
    expect(ZONE_NUMBERS.filter((z) => isAdjacent(me(z), me(z)))).toEqual([]);
  });

  it("4.4.5.3 before means a lower zone number, beyond a higher one, on the same field", () => {
    expect(isBefore(me(2), me(5))).toBe(true);
    expect(isBefore(me(6), me(5))).toBe(false);
    expect(isBeyond(me(6), me(5))).toBe(true);
    expect(isBeyond(me(4), me(5))).toBe(false);
    expect(isBefore(opp(2), me(5))).toBe(false);
    expect(isBeyond(opp(8), me(5))).toBe(false);
  });

  it("4.4.5.3.1 every zone is before and beyond itself", () => {
    for (const z of ZONE_NUMBERS) {
      expect(isBefore(me(z), me(z))).toBe(true);
      expect(isBeyond(me(z), me(z))).toBe(true);
    }
  });

  it("4.4.5.3 counts match zone numbers: zone 5 has 5 zones before it and 4 beyond it", () => {
    expect(ZONE_NUMBERS.filter((z) => isBefore(me(z), me(5)))).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(ZONE_NUMBERS.filter((z) => isBeyond(me(z), me(5)))).toEqual([
      5, 6, 7, 8,
    ]);
  });

  it("4.4.5.4 same column: a player's 1 with the opponent's 5 and 6, 2 with 4 and 7, 3 and 8 with 3 and 8", () => {
    // The rule is stated for "a player", so it holds from both sides: my 4 and 7 line up with
    // the opponent's 2, my 5 and 6 with the opponent's 1.
    const columns = pairs.filter(([a, b]) => sameColumn(me(a), opp(b)));
    expect(columns).toEqual([
      [1, 5],
      [1, 6],
      [2, 4],
      [2, 7],
      [3, 3],
      [3, 8],
      [4, 2],
      [5, 1],
      [6, 1],
      [7, 2],
      [8, 3],
      [8, 8],
    ]);
  });

  it("4.4.5.4 same column is symmetric and only relates zones of different players", () => {
    for (const [a, b] of pairs) {
      expect(sameColumn(opp(b), me(a))).toBe(sameColumn(me(a), opp(b)));
      expect(sameColumn(me(a), me(b))).toBe(false);
    }
  });

  it("4.4.5.5.1 own zones run left to right: 1, 2, {3, 8}, {4, 7}, {5, 6}", () => {
    expect(
      ZONE_NUMBERS.map((z) => [z, leftRightPosition(me(z), "me")]),
    ).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
      [6, 4],
      [7, 3],
      [8, 2],
    ]);
    expect(isLeftOf(me(1), me(2), "me")).toBe(true);
    expect(isLeftOf(me(2), me(8), "me")).toBe(true);
    expect(isRightOf(me(6), me(7), "me")).toBe(true);
    expect(isRightOf(me(4), me(3), "me")).toBe(true);
  });

  it("4.4.5.5.1.1 zones 3 and 8, 4 and 7, 5 and 6 have no left-right relation", () => {
    for (const [a, b] of [
      [3, 8],
      [4, 7],
      [5, 6],
    ] as const) {
      expect(isLeftOf(me(a), me(b), "me")).toBe(false);
      expect(isRightOf(me(a), me(b), "me")).toBe(false);
    }
  });

  it("4.4.5.5.2 the opponent's zones flip: their rightmost is my leftmost", () => {
    expect(isLeftOf(opp(1), opp(2), "opp")).toBe(true);
    expect(isRightOf(opp(1), opp(2), "me")).toBe(true);
    expect(isLeftOf(opp(5), opp(1), "me")).toBe(true);
    expect(ZONE_NUMBERS.map((z) => leftRightPosition(opp(z), "me"))).toEqual(
      ZONE_NUMBERS.map((z) => 4 - leftRightPosition(opp(z), "opp")),
    );
  });

  it("4.4.5.5.2 zones in the same column (4.4.5.4) share a left-right position from either view", () => {
    for (const [a, b] of pairs) {
      const aligned =
        leftRightPosition(me(a), "me") === leftRightPosition(opp(b), "me");
      expect(aligned).toBe(sameColumn(me(a), opp(b)));
    }
  });
});
