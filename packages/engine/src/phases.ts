import {
  counterMonster,
  moveBehind,
  counterPowerOf,
  getThreat,
  activeMonster,
} from "./counter";
import { resolveLosses } from "./losses";
import { guardLoop, resetLoopGuard } from "./loop";
import { advanceMonster } from "./movement";
import { checkTiming, hasPendingRuleActions, topOf } from "./rules";
import { requireChoice } from "./choices";
import {
  applyReplacement,
  hasKeyword,
  rageResetReplacement,
  replacementPayable,
  strategyReplacementFor,
} from "./interpreter";
import { cannotDraw, counterProofAgainst, hasFlag } from "./stats";
import {
  appendLog,
  drawCards,
  getOpponent,
  getPlayer,
  setRage,
  toDiscard,
} from "./state";
import type {
  GameState,
  Phase,
  PlayerState,
  Step,
  StrategyPlacement,
} from "./types";

/** Hand size the end phase draws up to (7.5.4). */
export const END_PHASE_HAND_SIZE = 5;

/** A plain JSON value, deep-copied by hand (no functions, Dates or cycles). */
function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = cloneValue(value[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const key in value) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = cloneValue(v);
  }
  return out as T;
}

/**
 * Copy of a game state for the next step (M6a: about 40x faster than a JSON round trip). Everything
 * is deep-copied except two parts the engine never changes once written: the log entries (the
 * log array is copied, its entries are shared) and the card catalog (shared). Keys keep their
 * order, so the state serializes exactly as before.
 */
export function cloneState(state: GameState): GameState {
  const { cards, log, ...rest } = state;
  return { ...cloneValue(rest), cards, log: log.slice() } as GameState;
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

/**
 * Once the engine waits at the main phase play timing with no choice open, the play timing is
 * the step in progress (M5d `currentStep`).
 */
export function syncCurrentStep(state: GameState): void {
  if (state.step === "7.3.2" && state.pendingChoice === null)
    state.currentStep = "7.3.2";
}

/** The phase a step belongs to (7.2 start, 7.3 main, 7.4 counter, 7.5 end). */
export function stepPhase(step: Step): Phase {
  if (step.startsWith("7.2.")) return "start";
  if (step.startsWith("7.3.")) return "main";
  if (step.startsWith("7.4.")) return "counter";
  return "end";
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
    // Base (K1, 12.9.2) keeps a strategy card in play: it isn't sent here.
    const player = turnPlayer(state);
    // M1 `staysInStrategyZone` does the same without the keyword (EBP04-089).
    const stays = (p: StrategyPlacement) =>
      p.placedOnTurn >= state.turn ||
      hasKeyword(state, p.card, "base") ||
      hasFlag(state, p.card, "staysInStrategyZone");
    const leaving = player.strategyZones.flat().filter((p) => !stays(p));
    // E21: a replacement can send a card elsewhere instead (EBP02-012). An optional one asks
    // its master first; the step waits for the answer and runs again (10.9).
    for (const { card } of leaving) {
      const replacement = strategyReplacementFor(state, card);
      if (!replacement?.ability.optional) continue;
      const ask = state.replacementAsks?.find(
        (a) => a.instanceId === card.instanceId,
      );
      if (ask?.answer) continue;
      if (!ask)
        state.replacementAsks = [
          ...(state.replacementAsks ?? []),
          {
            instanceId: card.instanceId,
            abilityId: replacement.abilityId,
            answer: null,
          },
        ];
      requireChoice(state, replacement.master, "confirm", "10.9", [
        { id: "yes", cardId: card.cardId, abilityId: replacement.abilityId },
        { id: "no", cardId: card.cardId, abilityId: replacement.abilityId },
      ]);
      return;
    }
    for (const { card } of leaving) {
      const replacement = strategyReplacementFor(state, card);
      const answer = replacement?.ability.optional
        ? state.replacementAsks?.find((a) => a.instanceId === card.instanceId)
            ?.answer
        : "yes";
      if (!replacement || answer !== "yes") continue;
      // Marked done first: its `instead` effects may stop for a choice (`placeUnder` asks where,
      // and a human who confirms single options sees even one place); the step then runs again
      // once the resolution ends, as 7.2.4 does.
      state.replacementAsks = [
        ...(state.replacementAsks ?? []).filter(
          (a) => a.instanceId !== card.instanceId,
        ),
        {
          instanceId: card.instanceId,
          abilityId: replacement.abilityId,
          answer: "done",
        },
      ];
      const outcome = applyReplacement(
        state,
        replacement,
        card,
        "strategyToDiscard",
        "7.2.3",
        {
          replaced: {
            kind: "cards",
            cards: [
              {
                instanceId: card.instanceId,
                cardId: card.cardId,
                rank: null,
                counterPower: null,
                threat: null,
              },
            ],
          },
        },
        true,
      );
      if (outcome === "paused") return;
    }
    delete state.replacementAsks;
    player.strategyZones = player.strategyZones.map((placements) => {
      const old = placements.filter((p) => !stays(p));
      for (const placement of old) {
        // Moved first, so a "sent from a strategy zone" trigger finds the card in the discard
        // pile (T3).
        const discarded = toDiscard(state, placement.card);
        appendLog(state, "discardStrategy", player.id, {
          rule: "7.2.3",
          cardId: placement.card.cardId,
          placedOnTurn: placement.placedOnTurn,
          instanceId: discarded.instanceId,
        });
      }
      return placements.filter(stays);
    }) as PlayerState["strategyZones"];
    goTo(state, "start", "7.2.4");
  },
  "7.2.4": (state) => {
    const player = turnPlayer(state);
    // E21 `rageReset` (EBP04-010): an optional replacement asks its master first; the step waits
    // for the answer, applies it (its discard may need a choice), and runs again (10.9).
    const top = topOf(player.invadingMonsterZone);
    const replacement =
      top && player.rage > 0 ? rageResetReplacement(state, top) : null;
    if (top && replacement && replacementPayable(state, replacement)) {
      const ask = state.replacementAsks?.find(
        (a) => a.instanceId === top.instanceId,
      );
      if (!ask && replacement.ability.optional) {
        state.replacementAsks = [
          {
            instanceId: top.instanceId,
            abilityId: replacement.abilityId,
            answer: null,
          },
        ];
        requireChoice(state, player.id, "confirm", "10.9", [
          { id: "yes", cardId: top.cardId, abilityId: replacement.abilityId },
          { id: "no", cardId: top.cardId, abilityId: replacement.abilityId },
        ]);
        return;
      }
      const answer = ask?.answer ?? "yes";
      if (answer === "yes") {
        state.replacementAsks = [
          {
            instanceId: top.instanceId,
            abilityId: replacement.abilityId,
            answer: "done",
          },
        ];
        const outcome = applyReplacement(
          state,
          replacement,
          top,
          "rageReset",
          "7.2.4",
          {},
          true,
        );
        if (outcome === "paused") return;
      }
    }
    const done = state.replacementAsks?.some((a) => a.answer === "done");
    delete state.replacementAsks;
    if (done) {
      goTo(state, "start", "7.2.5");
      return;
    }
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
    // A counter-proof monster (E13): no counter; with `insteadMoves` it moves as though
    // countered (5.15.1.1, Q14).
    const proof = countered
      ? counterProofAgainst(state, opponent, total)
      : null;
    if (proof) {
      appendLog(state, "counterPrevented", opponent.id, {
        rule: "7.4.3",
        total,
        moves: proof.moves,
      });
      if (proof.moves) moveBehind(state, opponent, true);
    } else if (countered) counterMonster(state, opponent);
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
    // M1: "your opponent cannot draw cards during the end phase" (EBP04-030, 1.3.3).
    const blocked = needed > 0 && cannotDraw(state, player);
    if (blocked) appendLog(state, "noDraw", player.id, { rule: "1.3.3" });
    const count = blocked ? 0 : drawCards(state, player, needed);
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
    // Abilities created "this turn" by an `until` effect end with the turn (T8, 10.6.5).
    state.timedTriggers = state.timedTriggers.filter(
      (t) => t.kind !== "delayed" || t.until !== "endOfTurn",
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
  next.currentStep = next.step;
  STEP_RUNNERS[next.step](next);
  resolveLosses(next);
  guardLoop(next);
  syncCurrentStep(next);
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
