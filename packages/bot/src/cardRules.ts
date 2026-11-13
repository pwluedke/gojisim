import { getCardAbilities } from "@gojisim/cards";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerId,
} from "@gojisim/engine";

/**
 * Card-play rules for Medium and Hard (Paul, Nov 12), on with `cardRules` (from Medium up) or
 * with Paul's play rules (`rules`, Hard). Like the rules, they act at the search root and on
 * blunders, judged on the first determinization, and read card data, never card names.
 *
 * 1. #255: a monster card that loses the game with no card in your strategy zones (Godzilla (1995)
 *    EBP03-013: "if there are no cards in your strategy zones, you lose") is played only when,
 *    once played, you have a strategy card in play or can play one this turn.
 */

type Json = Record<string, unknown>;

/** Every object nested anywhere in a value. */
function nested(value: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(value)) for (const v of value) nested(v, out);
  else if (value && typeof value === "object") {
    out.push(value as Json);
    for (const v of Object.values(value)) nested(v, out);
  }
  return out;
}

/** Whether a card has an ability that loses the game for its player while their strategy zones are empty. */
export function losesWithoutStrategy(deckCardNumber: string): boolean {
  return getCardAbilities(deckCardNumber).abilities.some((ability) => {
    const parts = nested(ability);
    const loses = parts.some(
      (p) => p["effect"] === "loseGame" && p["player"] === "you",
    );
    const emptyStrategy = parts.some((p) => {
      const count = p["count"] as Json | undefined;
      return (
        count?.["owner"] === "you" &&
        count["area"] === "strategy" &&
        p["op"] === "=" &&
        p["value"] === 0
      );
    });
    return loses && emptyStrategy;
  });
}

/** Rule 1: after playing it, a strategy card is in play or can be played this turn. */
function strategyCovered(state: GameState, me: PlayerId): boolean {
  const player = state.players.find((p) => p.id === me);
  if (player?.strategyZones.some((zone) => zone.length > 0)) return true;
  return getLegalActions(state, me).some((a) => a.type === "activateStrategy");
}

/** Its own [enter] choices taken (the first option each), up to the next decision that isn't one. */
function settleOwnChoices(state: GameState, me: PlayerId): GameState {
  let s = state;
  for (let i = 0; i < 20 && s.pendingChoice?.player === me; i++) {
    const first = getLegalActions(s, me).find((a) => a.type !== "concede");
    if (!first) break;
    s = advanceToDecision(applyAction(s, first));
  }
  return s;
}

/** The legal actions the card rules leave out, judged on `state` (the first determinization). */
export function cardRulesDead(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Set<Action> {
  const dead = new Set<Action>();
  for (const action of actions) {
    if (action.type !== "playMonster") continue;
    const card = state.players
      .find((p) => p.id === me)
      ?.hand.find((c) => c.instanceId === action.cardInstanceId);
    const data = card ? state.cards[card.cardId] : undefined;
    if (!data || !losesWithoutStrategy(data.deckCardNumber)) continue;
    let after: GameState;
    try {
      after = settleOwnChoices(
        advanceToDecision(applyAction(state, action)),
        me,
      );
    } catch {
      continue;
    }
    if (after.result) {
      if (after.result.winner !== me) dead.add(action);
      continue;
    }
    // The opponent answers something first: not judged.
    if (after.pendingChoice) continue;
    if (!strategyCovered(after, me)) dead.add(action);
  }
  return dead;
}
