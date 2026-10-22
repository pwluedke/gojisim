import { ismctsBot } from "./ismcts";
import type { Bot, BotSettings } from "./types";

/** Iterations at difficulty 100 (the full search), tuned so `hard` stays under 1 s per decision. */
export const FULL_ITERATIONS = 1000;

/** Difficulty presets (M6c). */
export const PRESETS = { easy: 20, medium: 55, hard: 90 } as const;

/**
 * The difficulty slider, 0 to 100 (M6c), as ISMCTS settings. Lower difficulty means fewer
 * iterations, a higher temperature (a looser pick among visited actions) and a higher chance to
 * blunder (play a uniformly random legal action). 0 is close to random play; 100 is the full
 * search.
 */
export function difficultySettings(difficulty: number): {
  iterations: number;
  temperature: number;
  blunder: number;
  maxMs: number;
} {
  const t = Math.max(0, Math.min(100, difficulty)) / 100;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    iterations: Math.round(4 + (FULL_ITERATIONS - 4) * t * t),
    temperature: round(1 - t),
    blunder: round(0.6 * (1 - t) * (1 - t)),
    maxMs: 1000,
  };
}

/** An ISMCTS bot at a fixed difficulty; a `difficulty` setting overrides it. */
export function difficultyBot(name: string, difficulty: number): Bot {
  return {
    name,
    chooseAction: (input) => {
      const level = Number(input.settings["difficulty"] ?? difficulty);
      const settings: BotSettings = {
        ...difficultySettings(level),
        ...input.settings,
      };
      return ismctsBot.chooseAction({ ...input, settings });
    },
  };
}

export const easyBot = difficultyBot("easy", PRESETS.easy);
export const mediumBot = difficultyBot("medium", PRESETS.medium);
export const hardBot = difficultyBot("hard", PRESETS.hard);
