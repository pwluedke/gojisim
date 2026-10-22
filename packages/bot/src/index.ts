import { ENGINE_DEPENDENCIES, ENGINE_PACKAGE } from "@gojisim/engine";
import { randomBot, weightedBot } from "./baseline";
import { easyBot, hardBot, mediumBot } from "./difficulty";
import { greedyBot } from "./greedy";
import { ismctsBot } from "./ismcts";
import type { Bot } from "./types";

export const BOT_PACKAGE = "@gojisim/bot";

export const BOT_DEPENDENCIES: readonly string[] = [
  ENGINE_PACKAGE,
  ...ENGINE_DEPENDENCIES,
];

export * from "./baseline";
export * from "./determinize";
export * from "./difficulty";
export * from "./evaluate";
export * from "./greedy";
export * from "./input";
export * from "./ismcts";
export * from "./types";

/** Bots by name, for the tournament harness. */
export const BOTS: Record<string, Bot> = {
  random: randomBot,
  weighted: weightedBot,
  greedy: greedyBot,
  ismcts: ismctsBot,
  easy: easyBot,
  medium: mediumBot,
  hard: hardBot,
};
