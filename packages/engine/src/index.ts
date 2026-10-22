import { CARDS_PACKAGE } from "@gojisim/cards";

export const ENGINE_PACKAGE = "@gojisim/engine";

export const ENGINE_DEPENDENCIES: readonly string[] = [CARDS_PACKAGE];

export { applyAction, getLegalActions } from "./actions";
export {
  type AdvanceOptions,
  advanceMonster,
  advanceMonsterTo,
  retreatMonster,
  retreatMonsterTo,
} from "./movement";
export * from "./geometry";
export {
  type AbilityDefinition,
  getAbility,
  registerAbility,
  type TriggerContext,
  unregisterAbility,
} from "./abilities";
export {
  activeMonster,
  counterPowerOf,
  getThreat,
  nextMonsterCandidates,
  RAGE_THREAT,
} from "./counter";
export {
  advance,
  advanceToDecision,
  END_PHASE_HAND_SIZE,
  isAtPlayTiming,
  isWaiting,
} from "./phases";
export {
  buildLoopReport,
  checkInvariants,
  type LoopReport,
} from "./invariants";
export {
  canonicalState,
  LOOP_STEP_LIMIT,
  type LoopInfo,
  stateHash,
} from "./loop";
export {
  type DeckLegality,
  deckLegalityFor,
  type GameRecord,
  replay,
  replayAll,
  startGame,
} from "./record";
export { normalizeSeed } from "./rng";
export { type CreateGameOptions, createGame, type PlayerSetup } from "./setup";
export * from "./types";
export * from "./view";
