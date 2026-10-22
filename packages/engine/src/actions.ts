import { getCardTraits } from "@gojisim/cards";
import { advanceMonster } from "./movement";
import { hasAbilityData, resumeResolution } from "./interpreter";
import { getRank } from "./stats";
import { activeMonster, makeInvadingMonster } from "./counter";
import { resetLoopGuard } from "./loop";
import { markLoss, resolveLosses } from "./losses";
import { cloneState, isAtPlayTiming } from "./phases";
import {
  cardOf,
  checkTiming,
  continueCheckTiming,
  resolveStandby,
} from "./rules";
import {
  appendLog,
  getOpponent,
  getPlayer,
  moved,
  setRage,
  toDiscard,
} from "./state";
import type {
  Action,
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  StrategyZoneNumber,
} from "./types";
import { ZONE_NUMBERS } from "./types";

const STRATEGY_ZONES: readonly StrategyZoneNumber[] = [1, 2];

function strategyZoneOf(player: PlayerState, zone: StrategyZoneNumber) {
  return player.strategyZones[zone === 1 ? 0 : 1];
}

/** Traits in force for a card, after trait errata (M1d). */
function traitsOf(state: GameState, card: CardInstance): string[] {
  return getCardTraits(cardOf(state, card));
}

/**
 * Whether a monster card in hand can be played on the invading monster (8.5.1): same rank as
 * the active monster and at least one shared trait. Burst (12.5) arrives in M4.
 */
function canPlayMonster(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
): boolean {
  const top = player.invadingMonsterZone[player.invadingMonsterZone.length - 1];
  const active = activeMonster(state, player);
  const data = cardOf(state, card);
  if (!top || !active || data.type !== "Monster" || data.rank !== active.rank)
    return false;
  const activeTraits = new Set(traitsOf(state, top));
  return traitsOf(state, card).some((trait) => activeTraits.has(trait));
}

/**
 * Every legal action for `playerId`. Only the turn player has a play timing (10.4.4.2, spec
 * "Actions"); a pending choice is answered only by its player with `choose`; `concede` is always
 * legal while the game runs (1.2.3). Nobody has actions once the game is over.
 */
export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
): Action[] {
  if (state.result !== null || !state.players.some((p) => p.id === playerId))
    return [];
  // 1.2.3: either player may concede at any time while the game runs.
  const concede: Action = { type: "concede", player: playerId };
  const choice = state.pendingChoice;
  if (choice !== null) {
    if (choice.player !== playerId) return [concede];
    return [
      ...choice.options.map((option): Action => ({
        type: "choose",
        player: playerId,
        choiceId: choice.id,
        optionId: option.id,
      })),
      concede,
    ];
  }
  if (!isAtPlayTiming(state) || playerId !== state.turnPlayer) return [concede];
  return [...mainPhaseActions(state, playerId), concede];
}

/** The turn player's actions at the main phase play timing (8.2 to 8.6, 10.4.4.3). */
function mainPhaseActions(state: GameState, playerId: PlayerId): Action[] {
  const player = getPlayer(state, playerId);
  const opponent = getOpponent(state, playerId);
  const ownZone = player.monsterPosition ?? 0;
  const opponentZone = opponent.monsterPosition ?? 0;
  const actions: Action[] = [];

  for (const card of player.hand) {
    const data = cardOf(state, card);
    const cardInstanceId = card.instanceId;
    // 8.2.1: rank at most the zone number of the opponent's monster, read through the 10.8.1
    // layers; 10.5.2.1.2: a zone the player's own monster does not occupy.
    const rank = data.type === "Monster" ? data.rank : getRank(state, card);
    if (data.type === "Battle" && rank !== null && rank <= opponentZone) {
      for (const zone of ZONE_NUMBERS) {
        if (zone !== player.monsterPosition) {
          actions.push({
            type: "playBattle",
            player: playerId,
            cardInstanceId,
            zone,
          });
        }
      }
    }
    // 8.3.1: rank at most the zone number of the player's own monster (10.8.1 layers); 8.3.2: an
    // empty strategy zone.
    if (data.type === "Strategy" && rank !== null && rank <= ownZone) {
      for (const strategyZone of STRATEGY_ZONES) {
        if (strategyZoneOf(player, strategyZone).length === 0) {
          actions.push({
            type: "activateStrategy",
            player: playerId,
            cardInstanceId,
            strategyZone,
          });
        }
      }
    }
    // 8.4.1: any monster card in hand; no per-turn limit.
    if (data.type === "Monster") {
      actions.push({ type: "gainRage", player: playerId, cardInstanceId });
    }
    // 8.5.1, and once per turn (Paul's ruling).
    if (!state.turnFlags.monsterPlayed && canPlayMonster(state, player, card)) {
      actions.push({ type: "playMonster", player: playerId, cardInstanceId });
    }
    // 8.6.1: any card in hand; 8.6.2: once per turn.
    if (!state.turnFlags.invasionUsed) {
      actions.push({ type: "invade", player: playerId, cardInstanceId });
    }
  }
  actions.push({ type: "pass", player: playerId });
  return actions;
}

function sameAction(a: Action, b: Action): boolean {
  return (
    JSON.stringify(a, Object.keys(a).sort()) ===
    JSON.stringify(b, Object.keys(b).sort())
  );
}

/** Removes a card from the player's hand. */
function takeFromHand(player: PlayerState, instanceId: string): CardInstance {
  const index = player.hand.findIndex((c) => c.instanceId === instanceId);
  const [card] = player.hand.splice(index, 1);
  if (!card)
    throw new Error(`Card ${instanceId} is not in ${player.id}'s hand`);
  return card;
}

/**
 * Play procedure (10.5.2): the card is revealed and moved to the resolution area (10.5.2.1.1),
 * then resolved (10.5.2.3), which takes it out of the resolution area again.
 */
function playFromHand(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  action: string,
): CardInstance {
  const card = moved(state, takeFromHand(player, instanceId));
  state.resolutionArea.push(card);
  appendLog(state, "play", player.id, {
    rule: "10.5.2.1.1",
    action,
    cardId: card.cardId,
    from: "hand",
    to: "resolutionArea",
  });
  return card;
}

function resolveFromResolutionArea(
  state: GameState,
  card: CardInstance,
): CardInstance {
  state.resolutionArea = state.resolutionArea.filter(
    (c) => c.instanceId !== card.instanceId,
  );
  return moved(state, card);
}

function discardFromHand(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  rule: string,
): CardInstance {
  const card = toDiscard(state, takeFromHand(player, instanceId));
  appendLog(state, "discard", player.id, { rule, cardId: card.cardId });
  return card;
}

const PERFORM: {
  [T in Action["type"]]: (
    state: GameState,
    action: Extract<Action, { type: T }>,
  ) => void;
} = {
  playBattle: (state, action) => {
    const player = getPlayer(state, action.player);
    const card = playFromHand(
      state,
      player,
      action.cardInstanceId,
      "playBattle",
    );
    const placed = resolveFromResolutionArea(state, card);
    // A zone that already holds a battle card now holds two; 11.5 destroys the older one at
    // the check timing that follows the action (10.4.4.1).
    player.zones[action.zone].push([placed]);
    appendLog(state, "place", player.id, {
      rule: "10.5.2.3.2",
      cardId: placed.cardId,
      instanceId: placed.instanceId,
      from: "resolutionArea",
      to: `zone ${action.zone}`,
    });
  },
  activateStrategy: (state, action) => {
    const player = getPlayer(state, action.player);
    const card = playFromHand(
      state,
      player,
      action.cardInstanceId,
      "activateStrategy",
    );
    const placed = resolveFromResolutionArea(state, card);
    strategyZoneOf(player, action.strategyZone).push({
      card: placed,
      placedOnTurn: state.turn,
    });
    appendLog(state, "place", player.id, {
      rule: "10.5.2.3.2",
      cardId: placed.cardId,
      instanceId: placed.instanceId,
      from: "resolutionArea",
      to: `strategy zone ${action.strategyZone}`,
    });
    // A card with ability data declares its own triggers (`placedInStrategyZone`, Q10); for a
    // manual card the text still waits for a later M4 PR.
    if (!hasAbilityData(state, placed))
      appendLog(state, "strategyTextPending", player.id, {
        rule: "10.1.1.1.2",
        cardId: placed.cardId,
      });
  },
  gainRage: (state, action) => {
    const player = getPlayer(state, action.player);
    discardFromHand(state, player, action.cardInstanceId, "8.4.1");
    setRage(state, player, player.rage + 1, "8.4.1");
    appendLog(state, "gainRage", player.id, {
      rule: "8.4.1",
      rage: player.rage,
    });
  },
  playMonster: (state, action) => {
    const player = getPlayer(state, action.player);
    const card = playFromHand(
      state,
      player,
      action.cardInstanceId,
      "playMonster",
    );
    const stacked = resolveFromResolutionArea(state, card);
    // 10.5.2.3.1: stacked on top; the monster keeps its position (4.7.2).
    player.invadingMonsterZone.push(stacked);
    appendLog(state, "place", player.id, {
      rule: "10.5.2.3.1",
      cardId: stacked.cardId,
      instanceId: stacked.instanceId,
      from: "resolutionArea",
      to: "invadingMonsterZone",
    });
    setRage(state, player, player.rage + 1, "8.5.1.1");
    appendLog(state, "gainRage", player.id, {
      rule: "8.5.1.1",
      rage: player.rage,
    });
    state.turnFlags.monsterPlayed = true;
  },
  invade: (state, action) => {
    const player = getPlayer(state, action.player);
    state.turnFlags.invasionUsed = true;
    const card = discardFromHand(state, player, action.cardInstanceId, "8.6.1");
    // 8.6.1.1: the number on the discarded card's invasion icon. No icon advances 0 times (1.3.2.2).
    const icon = cardOf(state, card).invadeZones ?? 0;
    appendLog(state, "invade", player.id, {
      rule: "8.6.1.1",
      cardId: card.cardId,
      icon,
    });
    let advances = 0;
    for (let i = 0; i < icon && state.result === null; i++) {
      if (advanceMonster(state, player, { invasion: true, rule: "8.6.1.2" }))
        advances++;
    }
    // 5.13.3: whether the monster actually advanced during this invasion (for When invading, M4).
    appendLog(state, "invasionDone", player.id, {
      rule: "5.13.3",
      advances,
      didAdvance: advances > 0,
    });
  },
  choose: (state, action) => {
    const choice = state.pendingChoice;
    if (!choice) throw new Error("No pending choice");
    state.pendingChoice = null;
    appendLog(state, "choose", action.player, {
      rule: choice.rule,
      kind: choice.kind,
      choiceId: choice.id,
      // A next-monster choice reveals the card: it becomes the public invading monster. A
      // private choice (a hand, a searched deck) stays hidden.
      cardId: choice.private
        ? null
        : (choice.options.find((o) => o.id === action.optionId)?.cardId ??
          null),
    });
    if (choice.kind === "standbyOrder") {
      resolveStandby(state, action.optionId);
    } else if (
      choice.kind === "target" ||
      choice.kind === "zone" ||
      choice.kind === "confirm" ||
      choice.kind === "replacementOrder"
    ) {
      resumeResolution(state, choice.kind, action.optionId);
    } else {
      makeInvadingMonster(
        state,
        getPlayer(state, action.player),
        action.optionId,
      );
    }
    resolveLosses(state);
    // Pick up the check timing the choice paused, if any (10.4.3).
    continueCheckTiming(state);
  },
  concede: (state, action) => {
    // 1.2.3: the conceding player loses at once, with no check timing; 1.2.3.1: nothing stops it.
    markLoss(state, action.player, "concession", "1.2.3");
    resolveLosses(state);
  },
  pass: (state, action) => {
    // 10.4.4.3: the player chose to do nothing, so the play timing and the main phase end (7.3.2).
    appendLog(state, "pass", action.player, { rule: "10.4.4.3" });
    state.phase = "counter";
    state.step = "7.4.1";
  },
};

/**
 * Applies a player's action and returns the new state. Throws "game over" once the game has a
 * result, and throws on any action `getLegalActions` does not list (including a stale `choose`).
 */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.result !== null) throw new Error("game over");
  if (
    !getLegalActions(state, action.player).some((legal) =>
      sameAction(legal, action),
    )
  ) {
    throw new Error(
      `Illegal action ${JSON.stringify(action)} at step ${state.step} (turn player ${state.turnPlayer})`,
    );
  }
  const next = cloneState(state);
  // A player choice: states seen before it no longer count toward a loop (13.1.1).
  resetLoopGuard(next);
  (PERFORM[action.type] as (state: GameState, action: Action) => void)(
    next,
    action,
  );
  resolveLosses(next);
  // The game ends the instant a player wins or loses (1.2.1): no further processing.
  const mainAction =
    action.type !== "pass" &&
    action.type !== "choose" &&
    action.type !== "concede";
  if (next.result === null && mainAction) {
    // 10.4.4.1: a check timing before the play timing is given again (10.4.4.2).
    checkTiming(next, "10.4.4.1");
    resolveLosses(next);
  }
  return next;
}
