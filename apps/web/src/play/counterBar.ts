/**
 * Where the threat line sits on the counter power bar (Oct 26, 2026): the bar shows counter power
 * up to 1.5 times the opponent's threat, so the line is two thirds along.
 */
export const THREAT_MARK = 2 / 3;

/**
 * The counter power bar's fill and threat marker, each 0 to 1 of the bar's width, and whether
 * this counter power counters (7.4.3: equal to or greater than the threat). The fill reaches the
 * marker exactly when counter power reaches the threat, and goes past it above. With no threat
 * the marker is at the start, and any counter power fills the bar.
 */
export function counterBar(
  power: number,
  threat: number,
): { fill: number; marker: number; counters: boolean } {
  const p = Math.max(0, power);
  if (threat <= 0) return { fill: p > 0 ? 1 : 0, marker: 0, counters: true };
  return {
    fill: Math.min(1, (p / threat) * THREAT_MARK),
    marker: THREAT_MARK,
    counters: p >= threat,
  };
}
