import { CARDS_PACKAGE } from "@gojisim/cards";

export const ENGINE_PACKAGE = "@gojisim/engine";

export const ENGINE_DEPENDENCIES: readonly string[] = [CARDS_PACKAGE];

export { applyAction, getLegalActions } from "./actions";
export * from "./geometry";
export {
  activeMonster,
  advance,
  advanceToDecision,
  counterPowerOf,
  END_PHASE_HAND_SIZE,
  isAtPlayTiming,
  RAGE_THREAT,
  threatOf,
} from "./phases";
export { normalizeSeed } from "./rng";
export { type CreateGameOptions, createGame, type PlayerSetup } from "./setup";
export * from "./types";
export * from "./view";
