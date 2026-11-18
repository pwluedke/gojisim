import cardsJson from "../data/cards.json";
import { type Card, CardListSchema } from "./schema";

let allCards: Card[] | null = null;
let version = 0;

/**
 * Every card in `cards.json`, validated once, plus any added at runtime (`registerCards`). Only
 * subpath entries (`test-decks`, `deck-lists`, `all-cards`) import this, so the main
 * `@gojisim/cards` entry never pulls in the card database.
 */
export function getAllCards(): Card[] {
  allCards ??= CardListSchema.parse(cardsJson as unknown);
  return allCards;
}

/**
 * Adds cards that aren't in `cards.json` at runtime (a card set served only to some accounts):
 * validated like the bundled ones; a card whose id is already known is skipped, so registering
 * the same set twice is harmless. Returns how many were added.
 */
export function registerCards(cards: unknown): number {
  const parsed = CardListSchema.parse(cards);
  const known = new Set(getAllCards().map((c) => c.id));
  const fresh = parsed.filter((c) => !known.has(c.id));
  if (fresh.length === 0) return 0;
  allCards = [...getAllCards(), ...fresh];
  version++;
  return fresh.length;
}

/** Changes whenever `registerCards` adds cards, so lookups built from the list can rebuild. */
export function cardsVersion(): number {
  return version;
}
