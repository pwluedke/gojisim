import type { Card } from "@gojisim/cards";
import {
  advance,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameState,
  type PlayerState,
  type ZoneNumber,
} from "../../src";
import { atPlayTiming, inHand } from "./real";
import {
  battleCard,
  logTypes,
  monsterCard,
  nonTurnPlayer,
  turnPlayer,
} from "./state";

/** Helpers for the M12 set tests: actions, choices and common positions. */

export const play = (
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  zone: ZoneNumber,
) =>
  applyAction(state, {
    type: "playBattle",
    player: player.id,
    cardInstanceId: card.instanceId,
    zone,
  });

export const playMonster = (
  state: GameState,
  player: PlayerState,
  card: CardInstance,
) =>
  applyAction(state, {
    type: "playMonster",
    player: player.id,
    cardInstanceId: card.instanceId,
  });

export const activate = (
  state: GameState,
  player: PlayerState,
  card: CardInstance,
) =>
  applyAction(state, {
    type: "activateStrategy",
    player: player.id,
    cardInstanceId: card.instanceId,
    strategyZone: 1,
  });

export const invade = (
  state: GameState,
  player: PlayerState,
  card: CardInstance,
) =>
  applyAction(state, {
    type: "invade",
    player: player.id,
    cardInstanceId: card.instanceId,
  });

export const gainRage = (
  state: GameState,
  player: PlayerState,
  card: CardInstance,
) =>
  applyAction(state, {
    type: "gainRage",
    player: player.id,
    cardInstanceId: card.instanceId,
  });

/** Answers the pending choice with the first option `pick` accepts. */
export function choose(
  state: GameState,
  pick: (id: string, cardId: number | null) => boolean,
) {
  const choice = state.pendingChoice;
  if (!choice) throw new Error("No pending choice");
  const option = choice.options.find((o) => pick(o.id, o.cardId));
  if (!option)
    throw new Error(`No matching option in ${JSON.stringify(choice.options)}`);
  return applyAction(state, {
    type: "choose",
    player: choice.player,
    choiceId: choice.id,
    optionId: option.id,
  });
}

/**
 * Answers every choice until the engine waits at a play timing or the game ends: "yes" to
 * confirms, otherwise the first option that isn't `done` (so searches find something).
 */
export function settle(state: GameState, max = 40): GameState {
  let current = advanceToDecision(state);
  for (let i = 0; i < max && current.pendingChoice; i++) {
    const options = current.pendingChoice.options;
    const pick =
      options.find((o) => o.id === "yes") ??
      options.find((o) => o.id !== "done") ??
      options[0];
    current = choose(current, (id) => id === pick?.id);
    current = advanceToDecision(current);
  }
  return current;
}

/** A battle card in hand whose invasion icon is `icon` (8.6.1.1). */
export const invader = (state: GameState, player: PlayerState, icon = 1) =>
  inHand(state, player, battleCard({ invadeZones: icon }));

export const godzilla = (rank: number, colors: Card["colors"] = ["Red"]) =>
  monsterCard(rank, { traits: ["Godzilla"], colors });

/**
 * My turn's play timing. My monster is in `position` (strategy cards up to that rank can be
 * activated, 8.3.1); the opponent's is in zone 8, so any battle card can be played (8.2.1) and
 * their zones 1 to 7 are free for battle cards.
 */
export function setup(position: ZoneNumber = 6) {
  const state = atPlayTiming();
  const me = turnPlayer(state);
  const opp = nonTurnPlayer(state);
  me.monsterPosition = position;
  opp.monsterPosition = 8;
  return { state, me, opp };
}

/** Runs the game on to `step`, answering choices as `settle` does. */
export function settleUntil(
  state: GameState,
  step: GameState["step"],
  max = 200,
): GameState {
  let current = state;
  // Stops at `step` once no choice is open (a step's check timing may still be asking), or
  // when the game ends.
  for (
    let i = 0;
    i < max &&
    current.result === null &&
    (current.step !== step || current.pendingChoice !== null);
    i++
  ) {
    if (current.pendingChoice) {
      // Answer it without running on, so the loop can stop at `step`.
      const options = current.pendingChoice.options;
      const pick =
        options.find((o) => o.id === "yes") ??
        options.find((o) => o.id !== "done") ??
        options[0];
      current = choose(current, (id) => id === pick?.id);
    } else if (current.step === "7.3.2")
      current = applyAction(current, {
        type: "pass",
        player: current.turnPlayer,
      });
    else current = advance(current);
  }
  return current;
}

/** Log entry types added after `before`. */
export const newLogTypes = (after: GameState, before: GameState) =>
  logTypes(after, before.log.length);

/** A state where it is the opponent's turn: `me` is the non-turn player. */
export function opponentsTurn() {
  const state = atPlayTiming();
  const opp = turnPlayer(state);
  const me = nonTurnPlayer(state);
  // Zone 5: the opponent can activate strategy cards up to rank 5 (8.3.1).
  opp.monsterPosition = 5;
  return { state, me, opp };
}

export const opponentOf = (state: GameState, player: PlayerState) =>
  state.players.find((p) => p.id !== player.id) as PlayerState;
export const self = (state: GameState, player: PlayerState) =>
  state.players.find((p) => p.id === player.id) as PlayerState;
