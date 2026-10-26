import { describe, expect, it } from "vitest";
import { counterBar, THREAT_MARK } from "./counterBar";

describe("counter power bar (7.4.3)", () => {
  it("no counter power: empty, the marker at the threat line", () => {
    expect(counterBar(0, 12000)).toEqual({
      fill: 0,
      marker: THREAT_MARK,
      counters: false,
    });
  });

  it("below the threat: short of the marker, in proportion", () => {
    const bar = counterBar(6000, 12000);
    expect(bar.fill).toBeCloseTo(THREAT_MARK / 2);
    expect(bar.fill).toBeLessThan(bar.marker);
    expect(bar.counters).toBe(false);
  });

  it("equal to the threat: exactly at the marker, and it counters (7.4.3)", () => {
    const bar = counterBar(12000, 12000);
    expect(bar.fill).toBeCloseTo(bar.marker);
    expect(bar.counters).toBe(true);
  });

  it("above the threat: past the marker, full at 1.5 times the threat and beyond", () => {
    const above = counterBar(15000, 12000);
    expect(above.fill).toBeGreaterThan(above.marker);
    expect(above.fill).toBeLessThan(1);
    expect(counterBar(18000, 12000).fill).toBeCloseTo(1);
    expect(counterBar(99000, 12000).fill).toBe(1);
  });

  it("no threat: the marker at the start; any counter power fills it and counters", () => {
    expect(counterBar(0, 0)).toEqual({ fill: 0, marker: 0, counters: true });
    expect(counterBar(3000, 0)).toEqual({ fill: 1, marker: 0, counters: true });
  });
});
