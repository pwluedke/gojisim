import { ENGINE_DEPENDENCIES, ENGINE_PACKAGE } from "@gojisim/engine";
import { randomBot, weightedBot } from "./baseline";
import {
  easyBot,
  hardBot,
  m12Bot,
  mediumBot,
  openBot,
  PRESETS,
} from "./difficulty";
import { greedyBot } from "./greedy";
import { ismctsBot } from "./ismcts";
import type { Bot } from "./types";

export const BOT_PACKAGE = "@gojisim/bot";

export const BOT_DEPENDENCIES: readonly string[] = [
  ENGINE_PACKAGE,
  ...ENGINE_DEPENDENCIES,
];

export * from "./baseline";
export * from "./deckGuess";
export * from "./determinize";
export * from "./difficulty";
export * from "./evaluate";
export * from "./greedy";
export * from "./input";
export * from "./ismcts";
export * from "./prune";
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
  // M13a: the search bot before M13a, at each preset, to compare against.
  "easy-m12": m12Bot("easy-m12", PRESETS.easy),
  "medium-m12": m12Bot("medium-m12", PRESETS.medium),
  "hard-m12": m12Bot("hard-m12", PRESETS.hard),
  // Q42: the current Hard with its opponent's decklist, for the hidden-decklist value test.
  "hard-open": openBot("hard-open", PRESETS.hard),
};
