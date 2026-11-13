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
 * Godzilla Against Mechagodzilla (a battle card) for its rage reset, never paid for an invasion.
 * The line waits until Despair can hit Mecha-King: its rank 3 needs your monster in zone 3 or
 * later (8.3.1), and it reaches only zones at or before your monster's.
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
/** Despair's [destroy] needs your monster at 2 or more [rage]. */
const DESPAIR_RAGE = 2;
/** Despair's rank: your monster in zone 3 or later to play it (8.3.1). */
const DESPAIR_RANK = 3;

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

/** The moves the plan argues against, and the ones it frees from Paul's rules' holds. */
export function wranglerVerdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
): { against: Set<Action>; rescued: Set<Action> } {
  const against = new Set<Action>();
  const rescued = new Set<Action>();
  if (!isWranglerDeck(own) || !wranglerLines(own).despair)
    return { against, rescued };
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent || state.turnPlayer !== me)
    return { against, rescued };
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
  if (choice?.player === me && choice.kind === "target") {
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
  // Godzilla Against Mechagodzilla stays for its rage reset: not paid for an invasion.
  for (const a of actions)
    if (
      a.type === "invade" &&
      handCard(state, me, a.cardInstanceId)?.deckCardNumber === GAM
    )
      against.add(a);
  const despairInHand = player.hand.some(
    (c) => state.cards[c.cardId]?.deckCardNumber === DESPAIR,
  );
  if (mechaKings.length === 0 || !despairInHand || at < DESPAIR_RANK)
    return { against, rescued };
  if (player.rage < DESPAIR_RAGE) {
    // To 2 rage first: the rage discards (but GAM), freed from Paul's rule 2 holds.
    for (const a of actions) {
      if (a.type === "gainRage" && !against.has(a)) rescued.add(a);
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
  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}
