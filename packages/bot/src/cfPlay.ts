import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameState,
  type PlayerId,
} from "@gojisim/engine";

/**
 * Paul's play rule for Constructed Future (SD05-005, Nov 5, 2026), part of the Hard rules layer:
 * activating it is dead unless resolving it would play a target: Mecha-King Ghidorah
 * (EBP02-068), King Ghidorah (2024) (EBP01-074; it turns on Gravity Beam, EPR-019), Godzilla, King
 * of the Monsters (EBP01-075), M.O.G.U.E.R.A. (EBP02-067) or GAM (EBP01-073; the engine plays GAM
 * only with its own condition met, 8+ monster cards in the discard pile). By rank the engine's
 * highest playable card already follows Paul's order. And (Nov 5, later) with a target there, it
 * is played: the main phase doesn't end (`pass`) while it could be. What it would play is read
 * from the engine's resolution, choices answered with their first option, not guessed from the
 * discard pile.
 */
const CONSTRUCTED_FUTURE = "SD05-005";
const ABILITY = "SD05-005#constructed-future";
const WORTH_IT = new Set([
  "EBP02-068",
  "EBP01-074",
  "EBP01-075",
  "EBP02-067",
  "EBP01-073",
]);
/** Choices a simulated resolution may answer before it gives up (then the play is kept). */
const MAX_CHOICES = 30;

/** The deck card number Constructed Future's resolution plays, `null` for none, `undefined` if unknown. */
export function constructedFuturePlays(
  state: GameState,
  action: Action,
): string | null | undefined {
  try {
    let s = advanceToDecision(applyAction(state, action));
    for (let i = 0; i < MAX_CHOICES; i++) {
      const placed = s.log
        .slice(state.log.length)
        .find(
          (e) =>
            e.type === "place" &&
            e.payload["abilityId"] === ABILITY &&
            e.payload["played"],
        );
      if (placed)
        return (
          s.cards[placed.payload["cardId"] as number]?.deckCardNumber ?? null
        );
      const choice = s.pendingChoice;
      if (!choice) return null;
      const option =
        choice.options.find((o) => o.id !== "done") ?? choice.options[0];
      if (!option) return undefined;
      s = advanceToDecision(
        applyAction(s, {
          type: "choose",
          player: choice.player,
          choiceId: choice.id,
          optionId: option.id,
        }),
      );
    }
  } catch {
    // A resolution the simulation can't follow: keep the play.
  }
  return undefined;
}

/** The Constructed Future activations Paul's rule rules out. */
export function constructedFutureDead(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
): Set<Action> {
  const dead = new Set<Action>();
  const me = state.players.find((p) => p.id === player);
  if (!me) return dead;
  for (const action of actions) {
    if (action.type !== "activateStrategy") continue;
    const card = me.hand.find((c) => c.instanceId === action.cardInstanceId);
    if (
      !card ||
      state.cards[card.cardId]?.deckCardNumber !== CONSTRUCTED_FUTURE
    )
      continue;
    const plays = constructedFuturePlays(state, action);
    if (plays !== undefined && (plays === null || !WORTH_IT.has(plays)))
      dead.add(action);
  }
  return dead;
}

/**
 * Paul's "if it can bring back a target, play it" (Nov 5, 2026): in the player's main phase, with
 * a Constructed Future activation that would bring back a target, ending the main phase (`pass`)
 * is dead. Other plays stay, so a card that makes it resolvable (a third battle card) can go first.
 */
export function constructedFuturePassDead(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
): Set<Action> {
  const dead = new Set<Action>();
  if (
    state.turnPlayer !== player ||
    state.pendingChoice ||
    state.step !== "7.3.2"
  )
    return dead;
  const me = state.players.find((p) => p.id === player);
  if (!me) return dead;
  const ready = actions.some((action) => {
    if (action.type !== "activateStrategy") return false;
    const card = me.hand.find((c) => c.instanceId === action.cardInstanceId);
    if (
      !card ||
      state.cards[card.cardId]?.deckCardNumber !== CONSTRUCTED_FUTURE
    )
      return false;
    const plays = constructedFuturePlays(state, action);
    return plays !== undefined && plays !== null && WORTH_IT.has(plays);
  });
  if (ready) for (const a of actions) if (a.type === "pass") dead.add(a);
  return dead;
}
