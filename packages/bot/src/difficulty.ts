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
 * search. M13a: from Medium up, dead strategy activations are pruned at the root (`prune.ts`).
 */
export function difficultySettings(difficulty: number): {
  iterations: number;
  temperature: number;
  blunder: number;
  maxMs: number;
  prune: number;
} {
  const t = Math.max(0, Math.min(100, difficulty)) / 100;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    iterations: Math.round(4 + (FULL_ITERATIONS - 4) * t * t),
    temperature: round(1 - t),
    blunder: round(0.6 * (1 - t) * (1 - t)),
    maxMs: 1000,
    prune: difficulty >= PRESETS.medium ? 1 : 0,
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

/**
 * The search bot as it was before M13a: no pruning, weighted rollouts, and both decklists known
 * (as before Q42). M13a's tournaments compare against it (`pnpm bots --b hard-m12`); explicit
 * settings still win.
 */
export const M12_SETTINGS: BotSettings = {
  prune: 0,
  rollout: "weighted",
};
export function m12Bot(name: string, difficulty: number): Bot {
  const bot = difficultyBot(name, difficulty);
  return {
    name,
    knowsDecklists: true,
    chooseAction: (input) =>
      bot.chooseAction({
        ...input,
        settings: { ...M12_SETTINGS, ...input.settings },
      }),
  };
}

/**
 * Tools only: a difficulty bot that also knows its opponent's decklist (as before Q42), for the
 * value test of hidden decklists and old comparisons (`hard-open`).
 */
export function openBot(name: string, difficulty: number): Bot {
  return { ...difficultyBot(name, difficulty), knowsDecklists: true };
}
