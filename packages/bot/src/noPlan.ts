import { mark } from "./trace";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerId,
} from "@gojisim/engine";
import { counterPlays, winsNow } from "./cardRules";
import { isFestDeck } from "./festPlan";
import { isMonsterXDeck } from "./mxPlan";
import { counters, heldCards } from "./rules";
import { isSpaceGDeck } from "./spacegPlan";
import { isTanglerDeck } from "./tanglerPlan";
import type { Decklist } from "./types";
import { isWranglerDeck } from "./wranglerPlan";

/**
 * #460 (Nov 17, from a tester's Ghidorat reports; report R-43): the play of a deck with no
 * plan of its own (not Wrangler, Tangler, Monster X, SpaceG while `spacegPlan` is on, or Fest while
 * `festPlan` is on). A preference
 * like the plans: the moves it argues against.
 *
 * 1. Use the cards (`noPlanUse`): no passing while a battle card can be played or a spare monster
 *    card raged (one the play rules don't hold for a rank-up, `heldCards`). "A card left in hand is
 *    wasted unless it has a reason to wait."
 * 2. Invade with a reason (`noPlanInvade`): an invasion that doesn't win now waits unless it gains
 *    something concrete: the invading monster's [invading] ability, or a counter it sets up (the
 *    counter made after it, not before). "An invasion with nothing to gain is only a cost."
 */
export interface NoPlanOptions {
  use?: boolean;
  invade?: boolean;
  /** Whether the Fest plan applies (`festPlan` on): a Fest deck has a plan only then. */
  festPlan?: boolean;
  /** Whether the SpaceG plan applies (`spacegPlan` on, #408): a SpaceG deck has a plan only then. */
  spacegPlan?: boolean;
}

/** A deck the bot has a plan for. */
export function hasPlan(
  state: GameState,
  me: PlayerId,
  own: Decklist | undefined,
  festPlan: boolean,
  spacegPlan = false,
): boolean {
  const player = state.players.find((p) => p.id === me);
  return (
    isWranglerDeck(own) ||
    isTanglerDeck(own) ||
    (!!player && isMonsterXDeck(state, player)) ||
    (festPlan && isFestDeck(own)) ||
    (spacegPlan && isSpaceGDeck(own))
  );
}

/** The state after `action`, or null when it can't be applied. */
function after(state: GameState, action: Action): GameState | null {
  try {
    return advanceToDecision(applyAction(state, action));
  } catch {
    return null;
  }
}

/** The moves the no-plan play argues against. */
export function noPlanVerdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  options: NoPlanOptions = {},
): Set<Action> {
  const {
    use = true,
    invade = true,
    festPlan = false,
    spacegPlan = false,
  } = options;
  const against = new Set<Action>();
  if (state.turnPlayer !== me || state.pendingChoice) return against;
  if (hasPlan(state, me, own, festPlan, spacegPlan)) return against;
  const player = state.players.find((p) => p.id === me);
  if (!player) return against;

  // Rule 1: no passing while a battle card can be played or a spare monster card raged.
  if (use) {
    const held = heldCards(state, player);
    const usable = actions.some(
      (a) =>
        a.type === "playBattle" ||
        (a.type === "gainRage" && !held.has(a.cardInstanceId)),
    );
    if (usable)
      for (const a of actions)
        if (a.type === "pass") mark(against, a, "No-plan play 1", "against");
  }

  // Rule 2: an invasion that doesn't win now needs an [invading] ability or a counter it makes.
  if (invade) {
    const top = player.invadingMonsterZone.at(-1);
    const invading =
      !!top && /\[invading\]/.test(state.cards[top.cardId]?.text ?? "");
    const counterNow =
      counters(state, me) || counterPlays(state, actions, me).size > 0;
    if (!invading)
      for (const a of actions) {
        if (a.type !== "invade" && a.type !== "invadeFromDeck") continue;
        if (winsNow(state, a, me)) continue;
        const s = after(state, a);
        const sets =
          !counterNow &&
          !!s &&
          s.result === null &&
          (counters(s, me) ||
            (s.turnPlayer === me &&
              !s.pendingChoice &&
              counterPlays(s, getLegalActions(s, me), me).size > 0));
        if (!sets) mark(against, a, "No-plan play 2", "against");
      }
  }

  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return against;
}
