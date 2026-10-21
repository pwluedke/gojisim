/** Normalizes a seed to an unsigned 32-bit integer; strings are hashed with FNV-1a. */
export function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed))
      throw new Error(`Seed must be finite, got ${seed}`);
    return Math.trunc(seed) >>> 0;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One mulberry32 step: returns the next state and a float in [0, 1). */
export function nextRandom(state: number): { state: number; value: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: next, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** Random integer in [0, n), advancing the state held in `rng`. */
export function randomInt(rng: { rngState: number }, n: number): number {
  const { state, value } = nextRandom(rng.rngState);
  rng.rngState = state;
  return Math.floor(value * n);
}

/** Fisher-Yates shuffle in place, using and advancing `rng.rngState`. */
export function shuffleInPlace<T>(rng: { rngState: number }, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
}
