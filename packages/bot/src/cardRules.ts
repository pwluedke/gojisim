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
 * 2. #246: in your zone 8 with the opponent's zone 8 occupied, when a play this turn can clear it
 *    and leave the invasion, clear it first: no invading into the blocker (it spends the turn's
 *    invasion, 8.6.2) and no passing; and inside that play, the answers that clear it (the
 *    blocker as the target, the option that destroys it).
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

/** The search budget for rule 2's look at a play's own choices (states visited). */
const CLEAR_BUDGET = 200;

const zone8Empty = (state: GameState, me: PlayerId) =>
  (state.players.find((p) => p.id !== me)?.zones[8].length ?? 1) === 0;

const canInvade = (state: GameState, me: PlayerId) =>
  getLegalActions(state, me).some((a) => a.type === "invade");

/**
 * Rule 2: whether `action` can leave the opponent's zone 8 empty with the invasion still to come
 * this turn: its own choices tried every way (a small search, `CLEAR_BUDGET` states), as the
 * bot would answer them.
 */
function clearsZone8(state: GameState, action: Action, me: PlayerId): boolean {
  let budget = CLEAR_BUDGET;
  const reaches = (s: GameState): boolean => {
    if (budget-- <= 0) return false;
    if (s.result) return s.result.winner === me;
    const choice = s.pendingChoice;
    if (choice?.player === me)
      return getLegalActions(s, me)
        .filter((a) => a.type === "choose")
        .some((a) => reaches(advanceToDecision(applyAction(s, a))));
    if (choice) return false;
    return s.turnPlayer === me && zone8Empty(s, me) && canInvade(s, me);
  };
  try {
    return reaches(advanceToDecision(applyAction(state, action)));
  } catch {
    return false;
  }
}

/**
 * Rule 2's verdict: the invasions and the pass, while another play clears the blocker first; at
 * one of the bot's own choices on the way, the answers that can't clear it while one can.
 */
function invadeIntoBlocker(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const player = state.players.find((p) => p.id === me);
  if (
    state.turnPlayer !== me ||
    player?.monsterPosition !== 8 ||
    zone8Empty(state, me) ||
    state.turnFlags.invasionUsed
  )
    return [];
  if (state.pendingChoice) {
    if (state.pendingChoice.player !== me) return [];
    const answers = actions.filter((a) => a.type === "choose");
    const clearing = new Set(answers.filter((a) => clearsZone8(state, a, me)));
    return clearing.size > 0 ? answers.filter((a) => !clearing.has(a)) : [];
  }
  if (!actions.some((a) => a.type === "invade")) return [];
  const clearing = actions.some(
    (a) =>
      a.type !== "invade" &&
      a.type !== "pass" &&
      a.type !== "concede" &&
      clearsZone8(state, a, me),
  );
  return clearing
    ? actions.filter((a) => a.type === "invade" || a.type === "pass")
    : [];
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
  for (const action of invadeIntoBlocker(state, actions, me)) dead.add(action);
  return dead;
}
