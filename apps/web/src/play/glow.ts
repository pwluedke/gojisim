import { useEffect, useState } from "react";

/** Glow colors by card color (M5f), as theme variables (M5g). White cards glow grey. */
export const GLOW_COLORS: Record<string, string> = {
  Red: "var(--color-glow-red)",
  Blue: "var(--color-glow-blue)",
  Green: "var(--color-glow-green)",
  grey: "var(--color-glow-grey)",
};

/**
 * The turn glow's color cycle for a monster's `colors` (M5f): each non-white color in turn, then
 * grey. A white (or colorless) monster glows grey only.
 */
export function glowCycle(colors: readonly string[]): string[] {
  const own = [
    ...new Set(colors.filter((c) => c !== "White" && GLOW_COLORS[c])),
  ];
  return [...own, "grey"];
}

/** Steps through `cycle` every `ms`; returns the current color name, or `null` with no cycle. */
export function useGlow(
  cycle: readonly string[] | null,
  ms = 1200,
): string | null {
  const [index, setIndex] = useState(0);
  const key = cycle?.join(",") ?? "";
  useEffect(() => {
    setIndex(0);
    if (!cycle || cycle.length < 2) return;
    const timer = setInterval(() => setIndex((i) => i + 1), ms);
    return () => clearInterval(timer);
    // The cycle's contents, not its identity, restart it.
  }, [key, ms]);
  if (!cycle || cycle.length === 0) return null;
  return cycle[index % cycle.length] ?? null;
}
