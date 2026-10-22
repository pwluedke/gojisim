import {
  counterMonster,
  counterPowerOf,
  getThreat,
  activeMonster,
} from "./counter";
import { resolveLosses } from "./losses";
import { guardLoop, resetLoopGuard } from "./loop";
import { advanceMonster } from "./movement";
import { checkTiming, hasPendingRuleActions } from "./rules";
import {
  appendLog,
  drawCards,
  getOpponent,
  getPlayer,
  setRage,
  toDiscard,
} from "./state";
import type { GameState, Phase, PlayerState, Step } from "./types";

/** Hand size the end phase draws up to (7.5.4). */
export const END_PHASE_HAND_SIZE = 5;

/** Deep copy. Game state is plain JSON, so a JSON round trip is exact. */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function turnPlayer(state: GameState): PlayerState {
  return getPlayer(state, state.turnPlayer);
}

function goTo(state: GameState, phase: Phase, step: Step): void {
  state.phase = phase;
  state.step = step;
}

/**
 * "At the beginning of the <phase>" trigger, then a check timing. Callers move `state.step` on
 * first, so a choice that pauses this check timing resumes into the next step.
 */
function beginningOf(state: GameState, phase: Phase, rule: string): void {
  // "At the beginning of the <phase>" trigger (no abilities trigger on it until M4).
  appendLog(state, "phaseBegins", state.turnPlayer, { rule, phase });
  checkTiming(state, rule);
}

/** Runs one engine step and sets `state.step` to the next one. Mutates `state`. */
const STEP_RUNNERS: Record<Step, (state: GameState) => void> = {
  "7.2.1": (state) => {
    state.turnFlags = { invasionUsed: false, monsterPlayed: false };
    resetLoopGuard(state);
    appendLog(state, "beginTurn", state.turnPlayer, {
      rule: "7.1.1",
      turn: state.turn,
    });
    goTo(state, "start", "7.2.2");
    beginningOf(state, "start", "7.2.1");
  },
  "7.2.2": (state) => {
    const player = turnPlayer(state);
    const rank = activeMonster(state, getOpponent(state, player.id))?.rank ?? 0;
    const count = drawCards(state, player, rank);
    appendLog(state, "draw", player.id, {
      rule: "7.2.2",
      count,
      opponentRank: rank,
    });
    goTo(state, "start", "7.2.3");
  },
  "7.2.3": (state) => {
    // Base (12.9) keeps a strategy card in play; it arrives with keyword abilities in M4.
    const player = turnPlayer(state);
    player.strategyZones = player.strategyZones.map((placements) => {
      const old = placements.filter((p) => p.placedOnTurn < state.turn);
      for (const placement of old) {
        appendLog(state, "discardStrategy", player.id, {
          rule: "7.2.3",
          cardId: placement.card.cardId,
          placedOnTurn: placement.placedOnTurn,
        });
        toDiscard(state, placement.card);
      }
      return placements.filter((p) => p.placedOnTurn >= state.turn);
    }) as PlayerState["strategyZones"];
    goTo(state, "start", "7.2.4");
  },
  "7.2.4": (state) => {
    const player = turnPlayer(state);
    appendLog(state, "setRage", player.id, {
      rule: "7.2.4",
      from: player.rage,
      rage: 0,
    });
    // A change from more than 0 is a rageChanged event; 0 to 0 is no change (1.3.2.1).
    setRage(state, player, 0, "7.2.4", {}, true);
    goTo(state, "start", "7.2.5");
  },
  "7.2.5": (state) => {
    goTo(state, "main", "7.3.1");
    checkTiming(state, "7.2.5");
  },
  "7.3.1": (state) => {
    goTo(state, "main", "7.3.2");
    // The play timing's own check timing (10.4.4.1) has nothing left to do after this one; it
    // runs after each action, before the play timing is given again.
    beginningOf(state, "main", "7.3.1");
  },
  "7.3.2": () => {
    // Play timing: the engine waits for the turn player's action.
  },
  "7.4.1": (state) => {
    goTo(state, "counter", "7.4.2");
    beginningOf(state, "counter", "7.4.1");
  },
  "7.4.2": (state) => {
    const player = turnPlayer(state);
    state.counterTotal = counterPowerOf(state, player);
    appendLog(state, "counterPower", player.id, {
      rule: "7.4.2",
      total: state.counterTotal,
    });
    goTo(state, "counter", "7.4.3");
  },
  "7.4.3": (state) => {
    const player = turnPlayer(state);
    const opponent = getOpponent(state, player.id);
    const total = state.counterTotal ?? 0;
    const threat = getThreat(state, opponent.id);
    const countered = total >= threat;
    appendLog(state, "counterCheck", player.id, {
      rule: "7.4.3",
      total,
      threat,
      countered,
    });
    state.counterTotal = null;
    goTo(state, "counter", "7.4.4");
    // A tie counts as a counter (7.4.3).
    if (countered) counterMonster(state, opponent);
  },
  "7.4.4": (state) => {
    goTo(state, "end", "7.5.1");
    checkTiming(state, "7.4.4");
  },
  "7.5.1": (state) => {
    goTo(state, "end", "7.5.2");
    beginningOf(state, "end", "7.5.1");
  },
  "7.5.2": (state) => {
    const player = turnPlayer(state);
    if (player.monsterPosition !== null && player.monsterPosition <= 7) {
      advanceMonster(state, player, { invasion: false, rule: "7.5.2" });
    }
    goTo(state, "end", "7.5.3");
  },
  "7.5.3": (state) => {
    goTo(state, "end", "7.5.4");
    checkTiming(state, "7.5.3");
  },
  "7.5.4": (state) => {
    const player = turnPlayer(state);
    const needed = Math.max(0, END_PHASE_HAND_SIZE - player.hand.length);
    const count = drawCards(state, player, needed);
    appendLog(state, "draw", player.id, { rule: "7.5.4", count });
    goTo(state, "end", "7.5.5");
  },
  "7.5.5": (state) => {
    goTo(state, "end", "7.5.6");
    checkTiming(state, "7.5.5");
  },
  "7.5.6": (state) => {
    const expired = state.continuousEffects.filter(
      (e) => e.duration === "untilEndOfTurn",
    );
    state.continuousEffects = state.continuousEffects.filter(
      (e) => e.duration !== "untilEndOfTurn",
    );
    appendLog(state, "expireEffects", null, {
      rule: "7.5.6",
      effectIds: expired.map((e) => e.effectId),
    });
    goTo(state, "end", "7.5.7");
  },
  "7.5.7": (state) => {
    if (state.standby.length > 0 || hasPendingRuleActions(state)) {
      goTo(state, "end", "7.5.4");
      return;
    }
    const next = getOpponent(state, state.turnPlayer);
    appendLog(state, "endTurn", state.turnPlayer, {
      rule: "7.5.7",
      turn: state.turn,
    });
    state.turn += 1;
    state.turnPlayer = next.id;
    goTo(state, "start", "7.2.1");
  },
};

/** Whether the engine is waiting for the turn player (main phase play timing, 7.3.2). */
export function isAtPlayTiming(state: GameState): boolean {
  return (
    state.result === null &&
    state.pendingChoice === null &&
    state.step === "7.3.2"
  );
}

/** Whether the engine is waiting for a player: a pending choice or the play timing. */
export function isWaiting(state: GameState): boolean {
  return state.pendingChoice !== null || state.step === "7.3.2";
}

/**
 * Runs the next automatic engine step and returns the new state. While waiting for a player (a
 * pending choice, or the main phase play timing 7.3.2) it returns the state unchanged. Throws
 * "game over" once the game has a result (1.2.1).
 */
export function advance(state: GameState): GameState {
  if (state.result !== null) throw new Error("game over");
  if (isWaiting(state)) return state;
  const next = cloneState(state);
  STEP_RUNNERS[next.step](next);
  resolveLosses(next);
  guardLoop(next);
  return next;
}

/** Calls `advance` until the engine waits for a player (a choice or the play timing) or the game ends. */
export function advanceToDecision(
  state: GameState,
  maxSteps = 1000,
): GameState {
  let current = state;
  for (let i = 0; i < maxSteps; i++) {
    if (current.result !== null || isWaiting(current)) return current;
    current = advance(current);
  }
  throw new Error(
    `No decision point within ${maxSteps} steps (stuck at ${current.step})`,
  );
}
