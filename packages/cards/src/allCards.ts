import cardsJson from "../data/cards.json";
import { type Card, CardListSchema } from "./schema";

let allCards: Card[] | null = null;

/**
 * Every card in `cards.json`, validated once. Only subpath entries (`test-decks`, `deck-lists`)
 * import this, so the main `@gojisim/cards` entry never pulls in the card database.
 */
export function getAllCards(): Card[] {
  allCards ??= CardListSchema.parse(cardsJson as unknown);
  return allCards;
}
