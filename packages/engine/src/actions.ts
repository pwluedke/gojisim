import { getCardTraits } from "@gojisim/cards";
import { advanceMonster } from "./movement";
import { closeManualWindow, manualProblem, performManual } from "./manual";
import {
  applyReplacement,
  burstRankOf,
  hasAbilityData,
  invasionCostReplacement,
  costPlays,
  monsterRulePlay,
  onTopPlays,
  playRuleOf,
  resumeResolution,
} from "./interpreter";
import { getRank, hasFlag, invasionPayable, playAllowed } from "./stats";
import { activeMonster, makeInvadingMonster } from "./counter";
import { resetLoopGuard } from "./loop";
import { markLoss, resolveLosses } from "./losses";
import { cloneState, isAtPlayTiming, syncCurrentStep } from "./phases";
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
  Binding,
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  StrategyZoneNumber,
} from "./types";
import { ZONE_NUMBERS } from "./types";

/** The player's strategy zones by number: 1 and 2, and 3 after an effect adds it (E20). */
function strategyZoneNumbers(player: PlayerState): StrategyZoneNumber[] {
  return player.strategyZones.map((_, i) => (i + 1) as StrategyZoneNumber);
}

function strategyZoneOf(player: PlayerState, zone: StrategyZoneNumber) {
  const placements = player.strategyZones[zone - 1];
  if (!placements) throw new Error(`No strategy zone ${zone}`);
  return placements;
}

/** Traits in force for a card, after trait errata (M1d). */
function traitsOf(state: GameState, card: CardInstance): string[] {
  return getCardTraits(cardOf(state, card));
}

/**
 * How a monster card in hand can be played on the invading monster, or `null` (8.5.1): it needs
 * at least one shared trait, and either the active monster's rank (`normal`) or, with Burst, a
 * Burst rank equal to it (`burst`, 12.5.2: played as though its rank were the Burst rank).
 */
function monsterPlay(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
): "normal" | "burst" | "rule" | null {
  const top = player.invadingMonsterZone[player.invadingMonsterZone.length - 1];
  const active = activeMonster(state, player);
  const data = cardOf(state, card);
  if (!top || !active || data.type !== "Monster") return null;
  const activeTraits = new Set(traitsOf(state, top));
  if (traitsOf(state, card).some((trait) => activeTraits.has(trait))) {
    if (data.rank === active.rank) return "normal";
    if (burstRankOf(state, card) === active.rank) return "burst";
  }
  // M2 (Q22, Q23): the card's own rule plays it onto a monster 8.5.1 wouldn't allow.
  return monsterRulePlay(state, player, card) ? "rule" : null;
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

/**
 * A hand card's rank for a plain play (8.2.1): its rank through the 10.8.1 layers, less its play
 * rule's reduction (M2), or `null` when it has no rank or the play is forbidden. The legal-action
 * check and `handPlayRankOver` both read it, so they never disagree.
 */
function handPlayRank(
  state: GameState,
  card: CardInstance,
  playerId: PlayerId,
): {
  rule: { reduction: number; forbidden: boolean };
  printed: number | null;
  rank: number | null;
} {
  const data = cardOf(state, card);
  const rule =
    data.type === "Monster"
      ? { reduction: 0, forbidden: false }
      : playRuleOf(state, card, playerId);
  const printed = data.type === "Monster" ? data.rank : getRank(state, card);
  const rank =
    printed === null || rule.forbidden ? null : printed - rule.reduction;
  return { rule, printed, rank };
}

/**
 * #138: how far a hand battle card's play rank is over the zone number of the opponent's monster
 * (8.2.1), with every play rank reduction counted (its own and others', M2): 0 or less when its
 * rank allows a plain play, `null` when it has no rank or the play is forbidden.
 */
export function handPlayRankOver(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): number | null {
  const card = getPlayer(state, playerId).hand.find(
    (c) => c.instanceId === instanceId,
  );
  if (!card) return null;
  const { rank } = handPlayRank(state, card, playerId);
  if (rank === null) return null;
  return rank - (getOpponent(state, playerId).monsterPosition ?? 0);
}

/** The turn player's actions at the main phase play timing (8.2 to 8.6, 10.4.4.3). */
function mainPhaseActions(state: GameState, playerId: PlayerId): Action[] {
  const player = getPlayer(state, playerId);
  const opponent = getOpponent(state, playerId);
  const ownZone = player.monsterPosition ?? 0;
  const opponentZone = opponent.monsterPosition ?? 0;
  const actions: Action[] = [];

  // M1: a monster that cannot invade (8.6).
  const monsterTop = player.invadingMonsterZone.at(-1);
  const canInvade = !monsterTop || !hasFlag(state, monsterTop, "cannotInvade");
  for (const card of player.hand) {
    const data = cardOf(state, card);
    const cardInstanceId = card.instanceId;
    // 8.2.1: rank at most the zone number of the opponent's monster, read through the 10.8.1
    // layers; 10.5.2.1.2: a zone the player's own monster does not occupy.
    // M2: a play rule can reduce the rank for this play, or forbid it.
    const { rule, printed, rank } = handPlayRank(state, card, playerId);
    if (data.type === "Battle" && rank !== null && rank <= opponentZone) {
      for (const zone of ZONE_NUMBERS) {
        // M1: "cannot play battle cards in zones ..." (EBP02-055).
        if (
          zone !== player.monsterPosition &&
          playAllowed(state, player, card, zone)
        ) {
          actions.push({
            type: "playBattle",
            player: playerId,
            cardInstanceId,
            zone,
          });
        }
      }
    }
    // M2: on top of a card in the zone, with that play's rank reduction (EBP03-051).
    if (data.type === "Battle" && printed !== null && !rule.forbidden)
      for (const { zone, reduction } of onTopPlays(state, card, playerId))
        if (
          printed - rule.reduction - reduction <= opponentZone &&
          playAllowed(state, player, card, zone)
        )
          actions.push({
            type: "playBattle",
            player: playerId,
            cardInstanceId,
            zone,
            onTop: true,
          });
    // M2: with the rank reduced for an optional cost, paid with a hand card (EBP04-045). Offered
    // only when the plain play can't be made; copies of one card pay alike, so one each.
    const costly =
      data.type === "Battle" && printed !== null && !rule.forbidden
        ? costPlays(state, card, playerId)
        : null;
    if (
      costly &&
      printed !== null &&
      printed - rule.reduction > opponentZone &&
      printed - rule.reduction - costly.reduction <= opponentZone
    ) {
      const payIds = new Set<number>();
      for (const pay of costly.payWith) {
        if (payIds.has(pay.cardId)) continue;
        payIds.add(pay.cardId);
        for (const zone of ZONE_NUMBERS)
          if (
            zone !== player.monsterPosition &&
            playAllowed(state, player, card, zone)
          )
            actions.push({
              type: "playBattle",
              player: playerId,
              cardInstanceId,
              zone,
              costCardInstanceId: pay.instanceId,
            });
      }
    }
    // 8.3.1: rank at most the zone number of the player's own monster (10.8.1 layers); 8.3.2: an
    // empty strategy zone.
    if (
      data.type === "Strategy" &&
      rank !== null &&
      rank <= ownZone &&
      playAllowed(state, player, card)
    ) {
      for (const strategyZone of strategyZoneNumbers(player)) {
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
    // 8.5.1, and once per turn (Paul's ruling). M2: or by the card's own rule (Q22, Q23), once
    // for each monster deck card that may go under the invading monster (EBP04-012).
    const how = state.turnFlags.monsterPlayed
      ? null
      : monsterPlay(state, player, card);
    const under =
      how === "rule" ? monsterRulePlay(state, player, card)?.under : null;
    if (under)
      for (const { instanceId } of under)
        actions.push({
          type: "playMonster",
          player: playerId,
          cardInstanceId,
          underInstanceId: instanceId,
        });
    else if (how !== null)
      actions.push({ type: "playMonster", player: playerId, cardInstanceId });
    // 8.6.1: any card in hand; 8.6.2: once per turn.
    // M1: cards the opponent's effects forbid as the invasion's cost (EBP04-029).
    if (
      !state.turnFlags.invasionUsed &&
      canInvade &&
      invasionPayable(state, player, card)
    ) {
      actions.push({ type: "invade", player: playerId, cardInstanceId });
    }
  }
  // E21: the top card of the deck pays for the invasion instead (EBP03-004).
  if (
    !state.turnFlags.invasionUsed &&
    canInvade &&
    player.deck.length > 0 &&
    invasionCostReplacement(state, player) !== null
  )
    actions.push({ type: "invadeFromDeck", player: playerId });
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
  extra: Record<string, unknown> = {},
): CardInstance {
  const card = toDiscard(state, takeFromHand(player, instanceId));
  // The card's id in the discard pile (public), for "when this card is discarded" (T3).
  appendLog(state, "discard", player.id, {
    rule,
    cardId: card.cardId,
    instanceId: card.instanceId,
    ...extra,
  });
  return card;
}

/**
 * The rest of an invasion once it is paid (8.6.1.1, 8.6.1.2): the paying card's invasion icon
 * says how many times the monster advances; no card or no icon advances 0 times (1.3.2.2).
 */
function invadeWith(
  state: GameState,
  player: PlayerState,
  paid: { cardId: number } | null,
): void {
  const icon = paid ? (state.cards[paid.cardId]?.invadeZones ?? 0) : 0;
  appendLog(state, "invade", player.id, {
    rule: "8.6.1.1",
    cardId: paid?.cardId ?? null,
    icon,
  });
  let advances = 0;
  const from = player.monsterPosition;
  for (let i = 0; i < icon && state.result === null; i++) {
    if (advanceMonster(state, player, { invasion: true, rule: "8.6.1.2" }))
      advances++;
  }
  // 5.13.3: whether the monster actually advanced during this invasion (for When invading, M4).
  appendLog(state, "invasionDone", player.id, {
    rule: "5.13.3",
    advances,
    didAdvance: advances > 0,
    // Where the invasion started and ended, for "invades into zones 6-8" (T6).
    from,
    to: player.monsterPosition,
  });
}

const PERFORM: {
  [T in Action["type"]]: (
    state: GameState,
    action: Extract<Action, { type: T }>,
  ) => void;
} = {
  playBattle: (state, action) => {
    const player = getPlayer(state, action.player);
    // M2: the play rule's cost, paid first (EBP04-045): a discard from the hand.
    if (action.costCardInstanceId)
      discardFromHand(state, player, action.costCardInstanceId, "10.5.4", {
        cost: true,
      });
    const card = playFromHand(
      state,
      player,
      action.cardInstanceId,
      "playBattle",
    );
    const placed = resolveFromResolutionArea(state, card);
    // "If this card was played from your hand" (C7).
    placed.playedVia = "hand";
    // M2: on top of the card there, stacked on it (3.2.5, EBP03-051).
    const host = action.onTop ? player.zones[action.zone].at(-1) : undefined;
    const under = host?.at(-1);
    if (host && under) host.push(placed);
    // A zone that already holds a battle card now holds two; 11.5 destroys the older one at
    // the check timing that follows the action (10.4.4.1).
    else player.zones[action.zone].push([placed]);
    appendLog(state, "place", player.id, {
      rule: "10.5.2.3.2",
      cardId: placed.cardId,
      instanceId: placed.instanceId,
      from: "resolutionArea",
      to: `zone ${action.zone}`,
      ...(under ? { onTopOf: under.cardId } : {}),
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
    const how = monsterPlay(
      state,
      player,
      player.hand.find(
        (c) => c.instanceId === action.cardInstanceId,
      ) as CardInstance,
    );
    const card = playFromHand(
      state,
      player,
      action.cardInstanceId,
      "playMonster",
    );
    const stacked = resolveFromResolutionArea(state, card);
    // M2 (Q22): the monster deck card goes into the stack under the current top card first.
    if (action.underInstanceId) {
      const index = player.monsterDeck.findIndex(
        (c) => c.instanceId === action.underInstanceId,
      );
      const [from] = player.monsterDeck.splice(index, 1);
      if (!from || index < 0) throw new Error("No such monster deck card");
      const under = moved(state, from);
      player.invadingMonsterZone.splice(
        player.invadingMonsterZone.length - 1,
        0,
        under,
      );
      appendLog(state, "placeUnder", player.id, {
        rule: "3.2",
        cardId: under.cardId,
        instanceId: under.instanceId,
        from: "monsterDeck",
        under: player.invadingMonsterZone.at(-1)?.cardId,
      });
    }
    // 10.5.2.3.1: stacked on top; the monster keeps its position (4.7.2).
    player.invadingMonsterZone.push(stacked);
    // A Burst play is from the hand too; `playedVia: "hand"` conditions accept both (C7).
    stacked.playedVia = "hand";
    if (how === "burst") {
      // 12.5.2: at the beginning of the master's next end phase, this card goes to the discard
      // pile, a timed trigger (10.6.5). Its rank is now its printed rank.
      stacked.playedVia = "burst";
      state.timedTriggers.push({
        kind: "burstDiscard",
        sourceInstanceId: stacked.instanceId,
        sourceCardId: stacked.cardId,
        master: player.id,
      });
    }
    appendLog(state, "place", player.id, {
      rule: "10.5.2.3.1",
      cardId: stacked.cardId,
      instanceId: stacked.instanceId,
      from: "resolutionArea",
      to: "invadingMonsterZone",
      // A Burst play (12.5.2), for combos (M5g).
      ...(how === "burst" ? { burst: true } : {}),
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
    invadeWith(state, player, card);
  },
  invadeFromDeck: (state, action) => {
    const player = getPlayer(state, action.player);
    state.turnFlags.invasionUsed = true;
    const replacement = invasionCostReplacement(state, player);
    const top = player.invadingMonsterZone.at(-1);
    if (!replacement || !top) throw new Error("No invasion cost replacement");
    // 10.9.1: the replacement's effects (a mill of 1) pay instead; its card is bound as `paid`.
    const bindings: Record<string, Binding> = {};
    applyReplacement(
      state,
      replacement,
      top,
      "invasionCost",
      "8.6.1",
      bindings,
    );
    const paid = bindings["paid"];
    const card = paid?.kind === "cards" ? paid.cards[0] : undefined;
    invadeWith(state, player, card ? { cardId: card.cardId } : null);
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
    const ask = state.replacementAsks?.find((a) => a.answer === null);
    if (choice.kind === "standbyOrder") {
      resolveStandby(state, action.optionId);
    } else if (choice.kind === "confirm" && state.resolution === null && ask) {
      // An optional replacement during an engine step (E21): the step runs again with it.
      ask.answer = action.optionId === "yes" ? "yes" : "no";
    } else if (
      choice.kind === "target" ||
      choice.kind === "zone" ||
      choice.kind === "confirm" ||
      choice.kind === "replacementOrder" ||
      choice.kind === "option"
    ) {
      resumeResolution(state, choice.kind, action.optionId);
    } else if (choice.kind === "manual") {
      closeManualWindow(state);
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
  manual: (state, action) => {
    performManual(state, action.player, action.op);
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
  // A manual override operation has free parameters, so it is validated rather than listed.
  const manualProblemText =
    action.type === "manual"
      ? manualProblem(state, action.player, action.op)
      : null;
  if (manualProblemText !== null)
    throw new Error(`Illegal manual action: ${manualProblemText}`);
  if (
    action.type !== "manual" &&
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
    action.type !== "concede" &&
    action.type !== "manual";
  if (next.result === null && mainAction) {
    // 10.4.4.1: a check timing before the play timing is given again (10.4.4.2).
    checkTiming(next, "10.4.4.1");
    resolveLosses(next);
  }
  syncCurrentStep(next);
  return next;
}
