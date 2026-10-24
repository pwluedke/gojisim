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
export { nextMonsterCandidates } from "./counter";
export {
  activeMonster,
  type CardChange,
  cardChanges,
  counterPowerOf,
  getCounterPower,
  getRank,
  getThreat,
  RAGE_THREAT,
} from "./stats";
export {
  abilitiesOf,
  hasAbilityData,
  REPLACEMENT_ORDER_IN_RULE_ACTION,
} from "./interpreter";
export {
  advance,
  advanceToDecision,
  cloneState,
  END_PHASE_HAND_SIZE,
  isAtPlayTiming,
  isWaiting,
  stepPhase,
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
  type MatchMode,
  replay,
  type SeatRecord,
  replayAll,
  startGame,
} from "./record";
export { canUndo, type UndoBoundary, undoBoundary, undoLast } from "./undo";
export { isFreezeGuardOn, setFreezeGuard } from "./freeze";
export { normalizeSeed } from "./rng";
export { type CreateGameOptions, createGame, type PlayerSetup } from "./setup";
export * from "./types";
export * from "./view";
export * from "./combos";
