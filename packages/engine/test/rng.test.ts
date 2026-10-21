import { describe, expect, it } from "vitest";
import { normalizeSeed } from "../src";
import { nextRandom, randomInt, shuffleInPlace } from "../src/rng";

describe("seeded RNG (mulberry32)", () => {
  it("Engine: is deterministic for a seed", () => {
    const run = (seed: number) => {
      const rng = { rngState: seed };
      return Array.from({ length: 5 }, () => randomInt(rng, 1000));
    };
    expect(run(99)).toEqual(run(99));
    expect(run(99)).not.toEqual(run(100));
  });

  it("Engine: returns floats in [0, 1) and spreads them out", () => {
    let state = 1;
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) {
      const next = nextRandom(state);
      state = next.state;
      expect(next.value).toBeGreaterThanOrEqual(0);
      expect(next.value).toBeLessThan(1);
      buckets[Math.floor(next.value * 4)]! += 1;
    }
    for (const count of buckets) expect(count).toBeGreaterThan(800);
  });

  it("5.3.1.2 shuffling 0 or 1 cards changes nothing", () => {
    const rng = { rngState: 3 };
    const empty: number[] = [];
    const one = [7];
    shuffleInPlace(rng, empty);
    shuffleInPlace(rng, one);
    expect(empty).toEqual([]);
    expect(one).toEqual([7]);
  });

  it("Engine: shuffles into a permutation of the input", () => {
    const rng = { rngState: 11 };
    const items = Array.from({ length: 50 }, (_, i) => i);
    shuffleInPlace(rng, items);
    expect([...items].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i),
    );
    expect(items).not.toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it("Engine: normalizes number and string seeds to unsigned 32-bit integers", () => {
    expect(normalizeSeed(-1)).toBe(4294967295);
    expect(normalizeSeed(2 ** 32 + 5)).toBe(5);
    expect(normalizeSeed("abc")).toBe(normalizeSeed("abc"));
    expect(normalizeSeed("abc")).not.toBe(normalizeSeed("abd"));
    expect(() => normalizeSeed(Number.NaN)).toThrow();
  });
});
