import type { GameResult } from "@gojisim/engine";
import LINES from "./gameOverLines.json";

/**
 * The game-over modal's lines (M5h #17): one list per outcome in `gameOverLines.json`, which
 * Paul edits. `lossTimer` waits for the match clock to end games.
 */
export type OutcomeKey = keyof typeof LINES;

export const GAME_OVER_LINES: Readonly<Record<OutcomeKey, readonly string[]>> =
  LINES;

/** The outcome for `viewer` (the human, or P1 between two bots). */
export function outcomeKey(result: GameResult, viewer: string): OutcomeKey {
  if (result.winner === null) return "draw";
  const won = result.winner === viewer;
  const how = (
    {
      invasion: "Invasion",
      victoryThroughCountering: "Counter",
      concession: "Concede",
      effect: "Effect",
      draw: "Invasion",
    } as const
  )[result.reason];
  return `${won ? "win" : "loss"}${how}`;
}

/** The heading's words for an outcome, e.g. "You win: invasion". */
export function outcomeHeading(key: OutcomeKey): string {
  if (key === "draw") return "Draw";
  const won = key.startsWith("win");
  const how = key.replace(/^(win|loss)/, "").toLowerCase();
  const words: Record<string, string> = {
    invasion: "victory through invasion",
    counter: "victory through countering",
    concede: "concession",
    effect: "a card effect",
    timer: "time",
  };
  return `${won ? "You win" : "You lose"}: ${words[how] ?? how}`;
}

/** A random line for `key`, never `last` (the line shown before) when there is another. */
export function pickLine(
  key: OutcomeKey,
  last: string | null,
  random: () => number = Math.random,
): string {
  const lines = GAME_OVER_LINES[key];
  const pool = lines.length > 1 ? lines.filter((l) => l !== last) : lines;
  return pool[Math.floor(random() * pool.length)] ?? lines[0] ?? "";
}

const LAST_KEY = "gojisim.lastGameOverLine";

/** The line shown last time, across games in this browser (storage may be blocked). */
export function lastLine(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function rememberLine(line: string): void {
  try {
    window.localStorage.setItem(LAST_KEY, line);
  } catch {
    // Blocked storage: a repeat across games is possible, never within one list pick.
  }
}
