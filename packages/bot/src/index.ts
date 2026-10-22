import { ENGINE_DEPENDENCIES, ENGINE_PACKAGE } from "@gojisim/engine";
import { randomBot, weightedBot } from "./baseline";
import { greedyBot } from "./greedy";
import type { Bot } from "./types";

export const BOT_PACKAGE = "@gojisim/bot";

export const BOT_DEPENDENCIES: readonly string[] = [
  ENGINE_PACKAGE,
  ...ENGINE_DEPENDENCIES,
];

export * from "./baseline";
export * from "./determinize";
export * from "./evaluate";
export * from "./greedy";
export * from "./input";
export * from "./types";

/** Bots by name, for the tournament harness. */
export const BOTS: Record<string, Bot> = {
  random: randomBot,
  weighted: weightedBot,
  greedy: greedyBot,
};
