import type { Action, GameState, PlayerId } from "@gojisim/engine";
import { canClearZone8, counterPlays } from "./cardRules";
import type { Decklist } from "./types";

/**
 * The Red Fest plan (Slick's answers to the Red Fest guide, Nov 13, via Monarch), for a "Red
 * Counter (Fest)" deck: the Fest Godzilla monster deck (EBP01-011, EBP01-012) with the Fest rank
 * III and IV (EBP01-013, EBP01-014) in the main deck (the catalog's archetype). Like the Wrangler
 * plan, a preference: it argues against moves and the search favors the others, with Paul's
 * rules (Hard); each line only when the bot's own decklist has the cards it names. (Slick's line
 * 1, "go second", has nothing to steer: the first player is random, 6.3.1.4.)
 *
 * Line 2: invade only from rank IV; before that push (Godzilla Landing, the Fest monsters,
 * Godzilla (2004)) and counter. Exception: invade earlier with 3 or more monster cards to rage, a
 * Space Beam EBP01-031 in hand and the opponent's zone 8 clear or clearable.
 * Line 3 (needs Anguirus (2004) EBP02-016): it goes in zone 1 or 2, unless it's needed for the
 * counter now in zone 3 or 8.
 * Line 4 (needs Godzilla the Ride EPR-015): get a Ride into the discard pile (it turns on the
 * others' +5000): Godzilla (1954) ESC01-001 pays with a Ride when one can pay, and a Ride goes on
 * a Ride (11.5 sends the first to the discard pile) when one can.
 * Line 5 (needs the Fest rank IV EBP01-014), against Monster X: the rank IV Fest with 2 or more
 * battle cards in your zones (Monster X's rank 5 or lower battle cards can't engage it), rage
 * heavily, and from rank IV go for the invasion.
 */

export const FEST_RANK_ONE = "EBP01-011";
export const FEST_RANK_TWO = "EBP01-012";
export const FEST_RANK_THREE = "EBP01-013";
export const FEST_RANK_FOUR = "EBP01-014";
export const SPACE_BEAM = "EBP01-031";
export const ANGUIRUS_2004 = "EBP02-016";
export const RIDE = "EPR-015";
export const GODZILLA_1954_BATTLE = "ESC01-001";
/** Line 2: invade from this rank of the invading monster. */
const INVADE_FROM_RANK = 4;
/** Line 2's exception: monster cards in hand to rage. */
const RAGE_CARDS = 3;
/** Line 5: battle cards in your zones for the rank IV Fest's guard. */
const FEST_GUARD_CARDS = 2;

type Card = GameState["cards"][number];

/** Whether a decklist is a Fest deck: the Fest monster deck and the Fest rank III and IV. */
export function isFestDeck(deck: Decklist | undefined): boolean {
  if (!deck) return false;
  const monsters = new Set(deck.monsterDeck.map((c) => c.deckCardNumber));
  const main = new Set(deck.mainDeck.map((c) => c.deckCardNumber));
  return (
    monsters.has(FEST_RANK_ONE) &&
    monsters.has(FEST_RANK_TWO) &&
    main.has(FEST_RANK_THREE) &&
    main.has(FEST_RANK_FOUR)
  );
}

const has = (deck: Decklist | undefined, n: string) =>
  deck?.mainDeck.some((c) => c.deckCardNumber === n) ?? false;

/** Whether a decklist is a Monster X deck (its monster deck has Monster X). */
const isMonsterX = (deck: Decklist | undefined) =>
  deck?.monsterDeck.some((c) => c.name === "Monster X") ?? false;

/** The moves the plan argues against. */
export function festVerdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  /** The opponent's decklist (public), when known. */
  theirs?: Decklist,
): { against: Set<Action>; rescued: Set<Action> } {
  const against = new Set<Action>();
  const rescued = new Set<Action>();
  if (!isFestDeck(own)) return { against, rescued };
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent || state.turnPlayer !== me || state.pendingChoice)
    return { against, rescued };
  const card = (id: string): Card | undefined => {
    const c = player.hand.find((h) => h.instanceId === id);
    return c ? state.cards[c.cardId] : undefined;
  };
  const top = player.invadingMonsterZone[player.invadingMonsterZone.length - 1];
  const rank = (top && state.cards[top.cardId]?.rank) ?? 0;
  const invades = actions.filter((a) => a.type === "invade");
  const rages = actions.filter((a) => a.type === "gainRage");
  const battleCards = Object.values(player.zones).filter((stacks) =>
    stacks.some((stack) => {
      const t = stack[stack.length - 1];
      return t !== undefined && state.cards[t.cardId]?.type === "Battle";
    }),
  ).length;
  const vsMonsterX =
    isMonsterX(theirs) ||
    opponent.invadingMonsterZone.some(
      (c) => state.cards[c.cardId]?.name === "Monster X",
    );

  // Line 2: no invasion before rank IV, but for the early-invasion exception.
  if (rank < INVADE_FROM_RANK && invades.length > 0) {
    const early =
      rages.length >= RAGE_CARDS &&
      player.hand.some(
        (c) => state.cards[c.cardId]?.deckCardNumber === SPACE_BEAM,
      ) &&
      canClearZone8(state, actions, me);
    if (!early) for (const a of invades) against.add(a);
  }

  // Line 3: Anguirus (2004) in zone 1 or 2, unless the counter needs it in zone 3 or 8 now.
  if (has(own, ANGUIRUS_2004)) {
    const plays = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" &&
        card(a.cardInstanceId)?.deckCardNumber === ANGUIRUS_2004,
    );
    if (plays.some((a) => a.zone === 1 || a.zone === 2)) {
      const needed = counterPlays(state, actions, me);
      for (const a of plays)
        if (
          a.zone !== 1 &&
          a.zone !== 2 &&
          !((a.zone === 3 || a.zone === 8) && needed.has(a))
        )
          against.add(a);
    }
  }

  // Line 4: get a Ride into the discard pile.
  const rideInDiscard = player.discard.some(
    (c) => state.cards[c.cardId]?.deckCardNumber === RIDE,
  );
  if (has(own, RIDE) && !rideInDiscard) {
    const isRide = (id: string | undefined) =>
      id !== undefined && card(id)?.deckCardNumber === RIDE;
    // Godzilla (1954) pays with a Ride when one can pay.
    const g1954 = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" &&
        card(a.cardInstanceId)?.deckCardNumber === GODZILLA_1954_BATTLE &&
        a.costCardInstanceId !== undefined,
    );
    if (g1954.some((a) => isRide(a.costCardInstanceId)))
      for (const a of g1954) if (!isRide(a.costCardInstanceId)) against.add(a);
    // A Ride goes on your own Ride when it can.
    const ridePlays = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" && isRide(a.cardInstanceId),
    );
    const onRide = (a: Extract<Action, { type: "playBattle" }>) =>
      player.zones[a.zone].some((stack) => {
        const t = stack[stack.length - 1];
        return (
          t !== undefined && state.cards[t.cardId]?.deckCardNumber === RIDE
        );
      });
    if (ridePlays.some(onRide))
      for (const a of ridePlays) if (!onRide(a)) against.add(a);
  }

  // Line 5: against Monster X, the rank IV Fest behind 2 battle cards, rage, invade from rank IV.
  if (vsMonsterX && has(own, FEST_RANK_FOUR)) {
    const fest4 = actions.filter(
      (a) =>
        a.type === "playMonster" &&
        card(a.cardInstanceId)?.deckCardNumber === FEST_RANK_FOUR,
    );
    if (fest4.length > 0 && battleCards >= FEST_GUARD_CARDS)
      for (const a of actions)
        if (
          a.type === "pass" ||
          (a.type === "gainRage" &&
            card(a.cardInstanceId)?.deckCardNumber === FEST_RANK_FOUR)
        )
          against.add(a);
    // Rage heavily: a rage discard over passing.
    if (rages.length > 0)
      for (const a of actions) if (a.type === "pass") against.add(a);
    // From rank IV, the invasion over passing.
    if (rank >= INVADE_FROM_RANK && invades.length > 0)
      for (const a of actions) if (a.type === "pass") against.add(a);
  }

  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}
