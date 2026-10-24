import { describe, expect, it } from "vitest";
import { type Baseline, checkGuard, GUARD } from "../src/guard";

const baseline: Baseline = {
  guard: GUARD,
  measuredOn: "test",
  date: "2026-10-24",
  microseconds: { calibration: 10, applyAction: 20, getLegalActions: 10 },
  relative: { applyAction: 2, getLegalActions: 1 },
};

describe("speed guard (bench/baseline.json)", () => {
  it("passes at up to 50 % over the baseline, in calibration units", () => {
    // A machine twice as slow doubles the calibration too: no change in relative terms.
    expect(
      checkGuard(
        { calibration: 20, applyAction: 40, getLegalActions: 20 },
        baseline,
      ),
    ).toEqual([]);
    expect(
      checkGuard(
        { calibration: 10, applyAction: 30, getLegalActions: 15 },
        baseline,
      ),
    ).toEqual([]);
  });

  it("fails each measure more than 50 % over, and says by how much", () => {
    const problems = checkGuard(
      { calibration: 10, applyAction: 31, getLegalActions: 32 },
      baseline,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^applyAction is 55 % over the baseline/);
    expect(problems[1]).toMatch(/^getLegalActions is 220 % over the baseline/);
  });

  it("the committed baseline uses the guard's current settings", async () => {
    const { default: committed } = await import(
      "../../../bench/baseline.json",
      { with: { type: "json" } }
    );
    expect(committed.guard).toEqual(GUARD);
  });
});
