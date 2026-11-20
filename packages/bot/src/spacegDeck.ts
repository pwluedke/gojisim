import type { Decklist } from "./types";

/** SpaceG's monster deck (#408). */
export const SPACEG_ONE = "EBP02-052";
export const SPACEG_TWO = "EBP02-053";
export const SPACEG_THREE = "EBP02-054";
export const SPACEG_FOUR = "EBP02-057";

/** A SpaceG list: SpaceGodzilla Flying Form EBP02-052 and SpaceGodzilla EBP02-054 in its monster deck. */
export function isSpaceGDeck(deck: Decklist | undefined): boolean {
  if (!deck) return false;
  const monsters = new Set(deck.monsterDeck.map((c) => c.deckCardNumber));
  return monsters.has(SPACEG_ONE) && monsters.has(SPACEG_THREE);
}
