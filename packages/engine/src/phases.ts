import {
  cardOf,
  checkTiming,
  crushAndDestroy,
  hasPendingRuleActions,
  topOf,
} from "./rules";
import {
  appendLog,
  drawCards,
  getOpponent,
  getPlayer,
  toDiscard,
} from "./state";
import type { GameState, Phase, PlayerState, Step, ZoneNumber } from "./types";
import { ZONE_NUMBERS } from "./types";

/** Hand size the end phase draws up to (7.5.4). */
export const END_PHASE_HAND_SIZE = 5;

/** Threat added per point of rage (3.4.5). */
export const RAGE_THREAT = 5000;

/** Deep copy. Game state is plain JSON, so a JSON round trip is exact. */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** The active monster: the top card of the invading monster stack (3.2.3.1). */
export function activeMonster(state: GameState, player: PlayerState) {
  const top = topOf(player.invadingMonsterZone);
  return top ? cardOf(state, top) : null;
}

/** Printed threat of the active monster plus 5,000 per point of rage (3.4.5). */
export function threatOf(state: GameState, player: PlayerState): number {
  return (
    (activeMonster(state, player)?.counterOrThreat ?? 0) +
    RAGE_THREAT * player.rage
  );
}

/**
 * Total counter power of a player's battle cards in zones (7.4.2). Only stacks topped by a battle
 * card count; monster cards in zones add nothing (7.4.2.1). Cannot-engage (5.16) arrives in M3d.
 */
export function counterPowerOf(state: GameState, player: PlayerState): number {
  let total = 0;
  for (const zone of ZONE_NUMBERS) {
    for (const stack of player.zones[zone]) {
      const top = topOf(stack);
      const card = top && cardOf(state, top);
      if (card?.type === "Battle") total += card.counterOrThreat ?? 0;
    }
  }
  return total;
}

function turnPlayer(state: GameState): PlayerState {
  return getPlayer(state, state.turnPlayer);
}

function goTo(state: GameState, phase: Phase, step: Step): void {
  state.phase = phase;
  state.step = step;
}

function beginningOf(state: GameState, phase: Phase, rule: string): void {
  // "At the beginning of the <phase>" trigger (no abilities trigger on it until M4).
  appendLog(state, "phaseBegins", state.turnPlayer, { rule, phase });
  checkTiming(state, rule);
}

/** Advances the turn player's monster 1 zone outside an invasion (5.13.1, 5.13.1.1.1). */
function advanceMonster(
  state: GameState,
  player: PlayerState,
  rule: string,
): void {
  const from = player.monsterPosition;
  if (from === null) return;
  if (from === 8) {
    appendLog(state, "advance", player.id, {
      rule: "5.13.1.1.1",
      from,
      to: from,
    });
    return;
  }
  const to = (from + 1) as ZoneNumber;
  player.monsterPosition = to;
  appendLog(state, "advance", player.id, { rule, from, to });
  // Interrupt rule action: entering a zone with its master's battle card destroys it (11.3).
  crushAndDestroy(state);
}

/** Runs one engine step and sets `state.step` to the next one. Mutates `state`. */
const STEP_RUNNERS: Record<Step, (state: GameState) => void> = {
  "7.2.1": (state) => {
    state.turnFlags = { invasionUsed: false, monsterPlayed: false };
    appendLog(state, "beginTurn", state.turnPlayer, {
      rule: "7.1.1",
      turn: state.turn,
    });
    beginningOf(state, "start", "7.2.1");
    goTo(state, "start", "7.2.2");
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
    player.rage = 0;
    goTo(state, "start", "7.2.5");
  },
  "7.2.5": (state) => {
    checkTiming(state, "7.2.5");
    goTo(state, "main", "7.3.1");
  },
  "7.3.1": (state) => {
    beginningOf(state, "main", "7.3.1");
    // The play timing's own check timing (10.4.4.1) has nothing left to do here; from M3c it
    // runs after each action, before the play timing is given again.
    goTo(state, "main", "7.3.2");
  },
  "7.3.2": () => {
    // Play timing: the engine waits for the turn player's action.
  },
  "7.4.1": (state) => {
    beginningOf(state, "counter", "7.4.1");
    goTo(state, "counter", "7.4.2");
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
    const threat = threatOf(state, opponent);
    const countered = total >= threat;
    appendLog(state, "counterCheck", player.id, {
      rule: "7.4.3",
      total,
      threat,
      countered,
    });
    if (countered) {
      // The counter itself (5.15) arrives in M3d.
      appendLog(state, "counterPending", opponent.id, { rule: "5.15" });
    }
    state.counterTotal = null;
    goTo(state, "counter", "7.4.4");
  },
  "7.4.4": (state) => {
    checkTiming(state, "7.4.4");
    goTo(state, "end", "7.5.1");
  },
  "7.5.1": (state) => {
    beginningOf(state, "end", "7.5.1");
    goTo(state, "end", "7.5.2");
  },
  "7.5.2": (state) => {
    const player = turnPlayer(state);
    if (player.monsterPosition !== null && player.monsterPosition <= 7) {
      advanceMonster(state, player, "7.5.2");
    }
    goTo(state, "end", "7.5.3");
  },
  "7.5.3": (state) => {
    checkTiming(state, "7.5.3");
    goTo(state, "end", "7.5.4");
  },
  "7.5.4": (state) => {
    const player = turnPlayer(state);
    const needed = Math.max(0, END_PHASE_HAND_SIZE - player.hand.length);
    const count = drawCards(state, player, needed);
    appendLog(state, "draw", player.id, { rule: "7.5.4", count });
    goTo(state, "end", "7.5.5");
  },
  "7.5.5": (state) => {
    checkTiming(state, "7.5.5");
    goTo(state, "end", "7.5.6");
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
  return state.result === null && state.step === "7.3.2";
}

/**
 * Runs the next automatic engine step and returns the new state. At the main phase play timing
 * (7.3.2), or once the game has a result, it returns the state unchanged.
 */
export function advance(state: GameState): GameState {
  if (state.result !== null || state.step === "7.3.2") return state;
  const next = cloneState(state);
  STEP_RUNNERS[next.step](next);
  return next;
}

/** Calls `advance` until the engine waits for a player or the game ends. */
export function advanceToDecision(
  state: GameState,
  maxSteps = 1000,
): GameState {
  let current = state;
  for (let i = 0; i < maxSteps; i++) {
    if (current.result !== null || current.step === "7.3.2") return current;
    current = advance(current);
  }
  throw new Error(
    `No decision point within ${maxSteps} steps (stuck at ${current.step})`,
  );
}
