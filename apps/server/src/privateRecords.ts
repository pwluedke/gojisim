import { getAllCards } from "@gojisim/cards/all-cards";

let listed: ReadonlySet<string> | null = null;

/**
 * Whether a game record's decks hold a card that isn't in the public `cards.json` (the private
 * set's, which the server never registers): such a record is kept out of everything shared.
 */
export function holdsUnlistedCard(record: unknown): boolean {
  listed ??= new Set(getAllCards().map((c) => c.deckCardNumber));
  const decks = (record as { decks?: unknown } | null)?.decks;
  if (!Array.isArray(decks)) return false;
  return decks.some((deck) =>
    ["monsterDeck", "mainDeck"].some((pile) => {
      const cards = (deck as Record<string, unknown> | null)?.[pile];
      return (
        Array.isArray(cards) &&
        cards.some((c) => {
          const n = (c as { deckCardNumber?: unknown } | null)?.deckCardNumber;
          return typeof n === "string" && !listed!.has(n);
        })
      );
    }),
  );
}
