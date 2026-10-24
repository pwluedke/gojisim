import { appendLog } from "./state";
import type { CardInstance, GameState } from "./types";
import { ZONE_NUMBERS } from "./types";

/**
 * Automatic steps (engine steps and ability resolutions) allowed in one turn without a player
 * choice. Past this the loop can't be stopped either, even if no state repeats exactly.
 */
export const LOOP_STEP_LIMIT = 2000;

/** How a loop was detected. */
export interface LoopInfo {
  /** `repeatedState`: the same state came back (13.1.1). `stepLimit`: LOOP_STEP_LIMIT reached. */
  kind: "repeatedState" | "stepLimit";
  turn: number;
  step: GameState["step"];
  /** Canonical state hash at detection. */
  hash: string;
  /** Log sequence number of the `infiniteLoop` entry. */
  seq: number;
}

const card = (c: CardInstance) =>
  c.statuses?.length ? [c.cardId, c.statuses] : c.cardId;

/**
 * The game state with engine bookkeeping removed: no log, counters, timestamps, RNG state or
 * instance ids (which are re-issued on every move, 4.1.4). Two states with the same canonical
 * form are "completely identical" for 13.1.1.2.
 */
export function canonicalState(state: GameState): unknown {
  return {
    turn: state.turn,
    turnPlayer: state.turnPlayer,
    phase: state.phase,
    step: state.step,
    turnFlags: state.turnFlags,
    counterTotal: state.counterTotal,
    players: state.players.map((p) => ({
      id: p.id,
      rage: p.rage,
      position: p.monsterPosition,
      zones: ZONE_NUMBERS.map((z) =>
        p.zones[z].map((stack) => stack.map(card)),
      ),
      strategy: p.strategyZones.map((zone) =>
        zone.map((s) => [card(s.card), s.placedOnTurn]),
      ),
      monster: p.invadingMonsterZone.map(card),
      monsterDeck: p.monsterDeck.map(card).sort(),
      deck: p.deck.map(card),
      hand: p.hand.map(card).sort(),
      discard: p.discard.map(card).sort(),
    })),
    resolution: state.resolutionArea.map(card),
    standby: state.standby.map((a) => [a.abilityId, a.sourceCardId, a.master]),
    timed: state.timedTriggers.map((t) => [
      t.kind,
      t.sourceCardId,
      t.master,
      ...(t.kind === "delayed" ? [t.abilityId] : []),
    ]),
    effects: state.continuousEffects.map((e) => [e.effectId, e.duration]),
    choice: state.pendingChoice && [
      state.pendingChoice.player,
      state.pendingChoice.kind,
      state.pendingChoice.options.map((o) => o.cardId),
    ],
    result: state.result,
  };
}

/** cyrb53: a fast 53-bit string hash (no crypto needed; the engine has no Node dependency). */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Hash of `canonicalState`. */
export function stateHash(state: GameState): string {
  return cyrb53(JSON.stringify(canonicalState(state)));
}

/** Forgets the states seen so far: a player made a choice, or a new turn began (13.1.1). */
export function resetLoopGuard(state: GameState): void {
  state.loopGuard = [];
}

/**
 * Records the current state after an automatic step. If the same state already occurred in this
 * turn with no player choice in between, nobody can stop the loop: the game is a draw (13.1.1.3).
 * Returns whether a loop was detected.
 */
export function guardLoop(state: GameState): boolean {
  if (state.result !== null) return false;
  const hash = stateHash(state);
  const repeated = state.loopGuard.includes(hash);
  if (!repeated && state.loopGuard.length < LOOP_STEP_LIMIT) {
    state.loopGuard.push(hash);
    return false;
  }
  const entry = appendLog(state, "infiniteLoop", null, {
    rule: "13.1.1.3",
    kind: repeated ? "repeatedState" : "stepLimit",
    hash,
  });
  state.loop = {
    kind: repeated ? "repeatedState" : "stepLimit",
    turn: state.turn,
    step: state.step,
    hash,
    seq: entry.seq,
  };
  state.result = { winner: null, reason: "draw", rule: "13.1.1.3" };
  state.pendingChoice = null;
  state.checkTiming = null;
  state.resolution = null;
  state.revealed = [];
  state.timedTriggers = [];
  state.manualQueue = [];
  state.standby = [];
  appendLog(state, "gameOver", null, {
    rule: "13.1.1.3",
    winner: null,
    reason: "draw",
  });
  return true;
}
