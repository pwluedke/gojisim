import { registerAbilities } from "@gojisim/cards";
import { registerCards } from "@gojisim/cards/all-cards";

/** The private card set as the engine needs it: its cards (and so its tokens) and abilities. */
export interface PrivateSetData {
  cards: unknown;
  abilities: Record<string, unknown>;
}

/**
 * Registers the set's cards, then its abilities. Known cards and abilities are skipped, so the
 * bot's worker can run it on every request. The cards come first: they carry the set's tokens
 * (`registerCards`), which its abilities create.
 */
export function registerPrivateSet(data: PrivateSetData): void {
  registerCards(data.cards);
  registerAbilities(data.abilities);
}
