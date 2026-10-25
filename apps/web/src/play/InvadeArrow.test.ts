import { describe, expect, it } from "vitest";
import { invadePath } from "./InvadeArrow";

describe("invade arrow path (M5h #7, 5.13.1)", () => {
  it("hops one zone per invasion icon along the path", () => {
    expect(invadePath(3, 2)).toEqual([
      { from: 3, to: 4 },
      { from: 4, to: 5 },
    ]);
  });

  it("a step from zone 8 goes into the opponent's zone 8, and stops there", () => {
    expect(invadePath(7, 3)).toEqual([
      { from: 7, to: 8 },
      { from: 8, to: "opp8" },
    ]);
  });
});
