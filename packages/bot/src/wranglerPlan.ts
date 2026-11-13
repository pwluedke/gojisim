import { getCardTraits } from "@gojisim/cards";
import type { Action, GameState, PlayerId } from "@gojisim/engine";
import type { Decklist } from "./types";

/**
 * The Wrangler plan (#276, Paul, Nov 12), for a "Red Counter (Wrangler)" deck: red Godzilla
 * monster cards, Godzilla Against Mechagodzilla, Godzilla, King of the Monsters, Godzilla (2023)
 * battle and Godzilla Landing (the catalog's archetype, `data/archetypes.json`). It applies to the
 * bot's own deck by archetype, never one exact list, and each line is on only when the bot's own
 * decklist has the cards it names (Paul's rule for every deck plan). Like the Monster X plan, a
 * preference: it argues against moves (`wranglerVerdict`), the search favors the others; it
 * frees moves Paul's rules hold (`rescued`) when its line needs them. With Paul's rules (Hard).
 *
 * Line 1 (#276, Ian; needs Despair EBP02-018 and Godzilla Against Mechagodzilla EBP01-073, as in
 * the Despangler): against a Mecha-King Ghidorah EBP02-068 in the opponent's zones, with Despair
 * in hand, discard for rage to 2 (Despair works from 2 rage), then Despair on Mecha-King; and keep
 * Godzilla Against Mechagodzilla (a battle card) for its rage reset and Despair, neither paid for an
 * invasion once a Mecha-King is public (the opponent's list or zones), from game turn 3.
 * The line waits until Despair can hit Mecha-King: its rank 3 needs your monster in zone 3 or
 * later (8.3.1), and it reaches only zones at or before your monster's.
 *
 * Line 2 (#274 point 1, Ian; the archetype alone): churn through the deck by raging a lot. From
 * game turn 3 (card rule 14 decides turns 1-2), the rage discards are freed from Paul's rules'
 * holds and favored over passing, but for the held key cards (`HELD`), which stay. Line 1 goes
 * first when it's on.
 *
 * Line 3 (Ian's report of Nov 12; needs Godzilla (2023) ESD01-002 and Godzilla (2004)): with
 * ESD01-002 the top monster card, invade paying with Godzilla (2004). The invasion's two zones
 * fire ESD01-002's [invading] search twice, so one card becomes two monster cards for rage. Until
 * then no pass, no stack (it would cover ESD01-002) and no rage for Godzilla (2004). It goes
 * ahead of line 2, after line 1.
 */

export const DESPAIR = "EBP02-018";
export const GAM = "EBP01-073";
export const MECHA_KING = "EBP02-068";
/** The archetype's core cards a deck fits by (any 3 of them, with a red Godzilla monster deck). */
const CORE = [
  "EBP01-075",
  "EBP01-073",
  "ESC01-004",
  "EBP01-030",
  "EBP03-004",
  "EBP01-015",
];
const CORE_NEEDED = 3;
/** Line 1's guard (GAM and Despair kept from invasions): from this game turn. */
export const GUARD_FROM_TURN = 3;
/** Despair's [destroy] needs your monster at 2 or more [rage]. */
const DESPAIR_RAGE = 2;
/** Despair's rank: your monster in zone 3 or later to play it (8.3.1). */
const DESPAIR_RANK = 3;
/** Line 2: the first game turn it churns on (card rule 14 decides turns 1-2). */
export const CHURN_FROM_TURN = 3;
/**
 * Line 2: monster cards held, not discarded for rage. Godzilla (2004) EBP01-008 (Ian's example:
 * its [enter] advances the opponent's monster) and Godzilla (1954) EBP01-004 (its zone 8 wipe,
 * card rule 15).
 */
export const HELD = new Set(["EBP01-008", "EBP01-004"]);
/** Line 3's cards: Godzilla (2004), and the rank 2 Godzilla (2023) whose [invading] searches. */
export const GODZILLA_2004 = "EBP01-008";
export const FETCHER = "ESD01-002";

type Card = GameState["cards"][number];

/** Whether a decklist is a Wrangler-like deck: a red Godzilla monster deck and 3 of the core cards. */
export function isWranglerDeck(deck: Decklist | undefined): boolean {
  if (!deck || deck.monsterDeck.length === 0) return false;
  const redGodzilla = deck.monsterDeck.every(
    (c) => c.colors.includes("Red") && getCardTraits(c).includes("Godzilla"),
  );
  const numbers = new Set(deck.mainDeck.map((c) => c.deckCardNumber));
  return (
    redGodzilla && CORE.filter((n) => numbers.has(n)).length >= CORE_NEEDED
  );
}

/** The plan's lines a decklist has the cards for. */
export function wranglerLines(deck: Decklist | undefined): {
  despair: boolean;
} {
  const numbers = new Set(deck?.mainDeck.map((c) => c.deckCardNumber));
  return { despair: numbers.has(DESPAIR) && numbers.has(GAM) };
}

const handCard = (
  state: GameState,
  me: PlayerId,
  id: string,
): Card | undefined => {
  const c = state.players
    .find((p) => p.id === me)
    ?.hand.find((h) => h.instanceId === id);
  return c ? state.cards[c.cardId] : undefined;
};

/**
 * Line 3: the invasions paying with Godzilla (2004) while Godzilla (2023) ESD01-002 is the top
 * monster card (its [invading] search, once a zone, fetches rank 3 Godzilla (2023) to rage); gated
 * on both cards in the bot's own lists.
 */
function fetchLine(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
): Action[] {
  if (!own) return [];
  if (!own.monsterDeck.some((c) => c.deckCardNumber === FETCHER)) return [];
  if (!own.mainDeck.some((c) => c.deckCardNumber === GODZILLA_2004)) return [];
  const player = state.players.find((p) => p.id === me);
  const top = player?.invadingMonsterZone.at(-1);
  if (!top || state.cards[top.cardId]?.deckCardNumber !== FETCHER) return [];
  return actions.filter(
    (a) =>
      a.type === "invade" &&
      handCard(state, me, a.cardInstanceId)?.deckCardNumber === GODZILLA_2004,
  );
}

/** The moves the plan argues against, and the ones it frees from Paul's rules' holds. */
export function wranglerVerdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  /** The opponent's decklist (public), when known. */
  theirs?: Decklist,
): { against: Set<Action>; rescued: Set<Action> } {
  const against = new Set<Action>();
  const rescued = new Set<Action>();
  if (!isWranglerDeck(own)) return { against, rescued };
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent || state.turnPlayer !== me)
    return { against, rescued };
  const despairLine = wranglerLines(own).despair;
  const at = player.monsterPosition ?? 0;
  // Mecha-King Ghidorah where Despair reaches: at or before your monster's zone.
  const mechaKings = Object.entries(opponent.zones).flatMap(([zone, stacks]) =>
    Number(zone) > at
      ? []
      : stacks.flatMap((stack) => {
          const top = stack[stack.length - 1];
          return top && state.cards[top.cardId]?.deckCardNumber === MECHA_KING
            ? [top]
            : [];
        }),
  );
  const choice = state.pendingChoice;
  // At Despair's target pick: Mecha-King Ghidorah.
  if (despairLine && choice?.player === me && choice.kind === "target") {
    const source = state.resolution
      ? state.cards[state.resolution.standby.sourceCardId]
      : undefined;
    if (source?.deckCardNumber !== DESPAIR) return { against, rescued };
    const targets = new Set(mechaKings.map((c) => c.instanceId));
    if (targets.size === 0) return { against, rescued };
    for (const a of actions)
      if (a.type === "choose" && !targets.has(a.optionId)) against.add(a);
    return { against, rescued };
  }
  if (choice) return { against, rescued };
  const despairInHand = player.hand.some(
    (c) => state.cards[c.cardId]?.deckCardNumber === DESPAIR,
  );
  // #276 follow-up: line 1's cards stay, not paid for an invasion (Godzilla Against Mechagodzilla
  // for its rage reset, Despair for Mecha-King), once a Mecha-King can matter: public in the
  // opponent's list or zones, from game turn 3.
  const mechaKingPublic =
    (theirs?.mainDeck.some((c) => c.deckCardNumber === MECHA_KING) ?? false) ||
    Object.values(opponent.zones).some((stacks) =>
      stacks.some((stack) =>
        stack.some((c) => state.cards[c.cardId]?.deckCardNumber === MECHA_KING),
      ),
    );
  if (despairLine && mechaKingPublic && state.turn >= GUARD_FROM_TURN) {
    for (const a of actions) {
      if (a.type !== "invade") continue;
      const n = handCard(state, me, a.cardInstanceId)?.deckCardNumber;
      if (n === GAM || n === DESPAIR) against.add(a);
    }
  }
  if (
    despairLine &&
    mechaKings.length > 0 &&
    despairInHand &&
    at >= DESPAIR_RANK
  ) {
    if (player.rage < DESPAIR_RAGE) {
      // To 2 rage first: the rage discards, freed from Paul's rule 2 holds.
      for (const a of actions) {
        if (a.type === "gainRage") rescued.add(a);
        else if (a.type !== "concede") against.add(a);
      }
    } else
      for (const a of actions)
        if (
          a.type !== "concede" &&
          !(
            a.type === "activateStrategy" &&
            handCard(state, me, a.cardInstanceId)?.deckCardNumber === DESPAIR
          )
        )
          against.add(a);
  } else if (fetchLine(state, actions, me, own).length > 0) {
    // Line 3: invade paying with Godzilla (2004) while the rank 2 Godzilla (2023) is on top.
    const pay = new Set(fetchLine(state, actions, me, own));
    for (const a of actions)
      if (
        a.type === "pass" ||
        a.type === "playMonster" ||
        (a.type === "invade" && !pay.has(a)) ||
        (a.type === "gainRage" &&
          handCard(state, me, a.cardInstanceId)?.deckCardNumber ===
            GODZILLA_2004)
      )
        against.add(a);
  } else if (state.turn >= CHURN_FROM_TURN) {
    // Line 2: churn. The rage discards but the held key cards are freed and favored over passing.
    const churn = actions.filter(
      (a) =>
        a.type === "gainRage" &&
        !HELD.has(handCard(state, me, a.cardInstanceId)?.deckCardNumber ?? ""),
    );
    if (churn.length > 0) {
      for (const a of churn) rescued.add(a);
      for (const a of actions)
        if (a.type === "pass" || (a.type === "gainRage" && !churn.includes(a)))
          against.add(a);
    }
  }
  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}
