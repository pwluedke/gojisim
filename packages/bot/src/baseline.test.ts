import type { Action, PlayerView } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { pickWith, plausiblePick } from "./baseline";
import { seededRng } from "./input";

// The view is read only for battle plays (zone 8 and safe zones); these options have none.
const view = {} as PlayerView;
const choose = (optionId: string): Action => ({
  type: "choose",
  player: "P2",
  choiceId: 18,
  optionId,
});

/** How often each action is picked over `n` seeded draws. */
function shares(options: Action[], n = 4000): Map<string, number> {
  const pick = pickWith(seededRng("plausible"));
  const counts = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const a = plausiblePick(view, options, pick);
    const key = a.type === "choose" ? a.optionId : a.type;
    counts.set(key, (counts.get(key) ?? 0) + 1 / n);
  }
  return counts;
}

describe("plausible blunders (#132)", () => {
  it("an optional zone pick declines half the time, not 1 time in 6 (the tester's ESD01-012 move out of zone 8)", () => {
    const options = ["P2:1", "P2:2", "P2:3", "P2:4", "P2:7", "done"].map(
      choose,
    );
    const s = shares(options);
    expect(s.get("done")).toBeGreaterThan(0.45);
    expect(s.get("done")).toBeLessThan(0.55);
    // The moves share the rest evenly.
    for (const zone of ["P2:1", "P2:2", "P2:3", "P2:4", "P2:7"]) {
      expect(s.get(zone)).toBeGreaterThan(0.07);
      expect(s.get(zone)).toBeLessThan(0.13);
    }
  });

  it("an optional ability's yes / no declines half the time; a choice with no decline stays uniform", () => {
    expect(shares(["yes", "no"].map(choose)).get("no")).toBeCloseTo(0.5, 1);
    const order = shares(["s7", "s8", "s9"].map(choose));
    for (const id of ["s7", "s8", "s9"])
      expect(order.get(id)).toBeCloseTo(1 / 3, 1);
  });

  it("outside a choice it is the weighted policy's pick: an invasion is rare, rage and passing common", () => {
    const options: Action[] = [
      { type: "gainRage", player: "P2", cardInstanceId: "c1" },
      { type: "pass", player: "P2" },
      { type: "invade", player: "P2", cardInstanceId: "c2" },
    ];
    const s = shares(options);
    // Weights 20 : 8 : 1 (decision 124).
    expect(s.get("gainRage")).toBeCloseTo(20 / 29, 1);
    expect(s.get("pass")).toBeCloseTo(8 / 29, 1);
    expect(s.get("invade") ?? 0).toBeLessThan(0.07);
  });
});
