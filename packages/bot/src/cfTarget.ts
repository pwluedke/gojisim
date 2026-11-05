import type { Action, GameState, PlayerId } from "@gojisim/engine";

/**
 * Paul's Constructed Future test (Nov 4, 2026), a tools-only setting of the Hard rules layer.
 * SD05-005 plays the highest-rank battle card in the discard pile, so which card goes there for a
 * cost aims it:
 * - `23`: a cost discard with Mecha-King Ghidorah (EBP02-068) as an option discards it, and GAM
 *   (EBP01-073) is kept to play while another card can pay;
 * - `gam`: while a Constructed Future is in hand or deck, Mecha-King Ghidorah is never discarded
 *   for a cost when another card can pay, and GAM is discarded first;
 * - `23one` (Nov 5): at most one Mecha-King Ghidorah goes to the discard pile for costs: with one
 *   there already, another isn't discarded while a different card can pay (the rest hold the
 *   column lock); otherwise as `auto`;
 * - `auto` (the default): the search decides.
 * A cost discard is an invade (it discards the hand card it names, 8.6.1.1) or a choice of cards
 * in the player's own hand. Card numbers are read directly, as this is a test setting.
 */
export type CfTarget = "auto" | "23" | "gam" | "23one";

const MECHA_KING = "EBP02-068";
const GAM = "EBP01-073";
const CONSTRUCTED_FUTURE = "SD05-005";

/** The hand card a cost-discard action gives up, or null when the action isn't one. */
function discarded(
  state: GameState,
  action: Action,
  player: PlayerId,
): string | null {
  const me = state.players.find((p) => p.id === player);
  if (!me) return null;
  const numberOf = (instanceId: string) => {
    const card = me.hand.find((c) => c.instanceId === instanceId);
    return card ? (state.cards[card.cardId]?.deckCardNumber ?? null) : null;
  };
  if (action.type === "invade") return numberOf(action.cardInstanceId);
  if (
    action.type === "choose" &&
    state.pendingChoice?.player === player &&
    state.pendingChoice.options.every(
      (o) => o.id === "done" || numberOf(o.id) !== null,
    )
  )
    return numberOf(action.optionId);
  return null;
}

/** The actions `policy` rules out: cost discards of the card it doesn't want discarded. */
export function cfTargetDead(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
  policy: CfTarget,
): Set<Action> {
  const dead = new Set<Action>();
  if (policy === "auto") return dead;
  const me = state.players.find((p) => p.id === player);
  if (!me) return dead;
  const costs = actions.flatMap((a) => {
    const number = discarded(state, a, player);
    return number === null ? [] : [{ action: a, number }];
  });
  if (costs.length < 2) return dead;
  const has = (n: string) => costs.some((c) => c.number === n);
  const others = (n: string) => costs.some((c) => c.number !== n);
  const killUnless = (keep: string) => {
    for (const c of costs) if (c.number !== keep) dead.add(c.action);
  };
  const killOnly = (drop: string) => {
    for (const c of costs) if (c.number === drop) dead.add(c.action);
  };
  if (policy === "23one") {
    const inDiscard = me.discard.some(
      (c) => state.cards[c.cardId]?.deckCardNumber === MECHA_KING,
    );
    if (inDiscard && has(MECHA_KING) && others(MECHA_KING))
      killOnly(MECHA_KING);
    return dead;
  }
  if (policy === "23") {
    if (has(MECHA_KING)) killUnless(MECHA_KING);
    else if (has(GAM) && others(GAM)) killOnly(GAM);
    return dead;
  }
  const futureLeft = [...me.hand, ...me.deck].some(
    (c) => state.cards[c.cardId]?.deckCardNumber === CONSTRUCTED_FUTURE,
  );
  if (has(GAM)) killUnless(GAM);
  else if (futureLeft && has(MECHA_KING) && others(MECHA_KING))
    killOnly(MECHA_KING);
  return dead;
}
