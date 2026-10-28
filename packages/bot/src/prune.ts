import { getCardAbilities } from "@gojisim/cards";
import {
  type Action,
  advanceToDecision,
  applyAction,
  counterPowerOf,
  type GameState,
  getThreat,
  type PlayerId,
} from "@gojisim/engine";

/**
 * Dead-card pruning (M13a): a strategy activation whose only effect is moving the card out of the
 * hand. Judged from the engine's result on a determinization, not from card names:
 * - the activation logs nothing but the card's placement and its abilities failing
 *   (`conditionNotMet`, `abilityInactive`), and opens no choice; and
 * - any counter power or threat it changes leaves the counter's result as it was, with the
 *   counter already made (7.4.3).
 * The card must have nothing that could matter later: only abilities that resolve on placement
 * and total counter power bonuses. Strategy cards leave at their owner's next start phase (7.2.3),
 * so such a card does nothing past this turn. Battle cards always add counter power and can block,
 * so they are never dead.
 */

/** Log entries an activation makes on its own, with no effect on the game. */
const QUIET_LOGS = new Set([
  "play",
  "place",
  "enterStandby",
  "checkTiming",
  "resolveAbility",
  "conditionNotMet",
  "abilityInactive",
]);

/** Whether a card's abilities can only matter when it is placed, or through total counter power. */
function placementOnly(cardNumber: string): boolean {
  const { abilities } = getCardAbilities(cardNumber);
  return abilities.every(
    (a) =>
      (a.kind === "triggered" && a.trigger.on === "placedInStrategyZone") ||
      (a.kind === "continuous" &&
        a.modifiers.every(
          (m) => "stat" in m && m.stat === "totalCounterPower",
        )),
  );
}

/** Whether `player`'s counter succeeds now (7.4.3: total counter power at least the threat). */
const counters = (state: GameState, player: PlayerId): boolean => {
  const me = state.players.find((p) => p.id === player);
  const opponent = state.players.find((p) => p.id !== player);
  return (
    !!me &&
    !!opponent &&
    counterPowerOf(state, me) >= getThreat(state, opponent.id)
  );
};

export function isDeadAction(
  state: GameState,
  action: Action,
  player: PlayerId,
): boolean {
  if (action.type !== "activateStrategy") return false;
  const me = state.players.find((p) => p.id === player);
  const opponent = state.players.find((p) => p.id !== player);
  const card = me?.hand.find((c) => c.instanceId === action.cardInstanceId);
  const data = card ? state.cards[card.cardId] : undefined;
  if (!me || !opponent || !data || !placementOnly(data.deckCardNumber))
    return false;
  const after = advanceToDecision(applyAction(state, action));
  if (after.result !== null) return false;
  if (after.pendingChoice && after.pendingChoice.player === player)
    return false;
  const logs = after.log.slice(state.log.length);
  if (logs.some((e) => !QUIET_LOGS.has(e.type))) return false;
  const meAfter = after.players.find((p) => p.id === player);
  const changed =
    counterPowerOf(after, meAfter ?? me) !== counterPowerOf(state, me) ||
    getThreat(after, opponent.id) !== getThreat(state, opponent.id);
  if (!changed) return true;
  // A bonus that can't change the result: the counter is made without it, and with it.
  return counters(state, player) && counters(after, player);
}

/**
 * The keys of `actions` that are dead in `state`, as long as another action is left: pass and
 * keeping cards always stay available.
 */
export function deadKeys(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
  keyOf: (action: Action) => string,
): Set<string> {
  const dead = new Set<string>();
  for (const action of actions)
    if (isDeadAction(state, action, player)) dead.add(keyOf(action));
  const alive = actions.filter((a) => !dead.has(keyOf(a)));
  return alive.length > 0 ? dead : new Set();
}
