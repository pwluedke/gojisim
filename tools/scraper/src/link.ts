import {
  type Card,
  type CardOverrides,
  CardSchema,
  stripPrintMarkers,
} from "@gojisim/cards";

/**
 * Applies manual overrides, then sets each print's `deckCardNumber` from the root of its parent
 * chain. An override's own `deckCardNumber` wins over the computed one.
 */
export function linkPrints(cards: Card[], overrides: CardOverrides): Card[] {
  const byId = new Map(cards.map((card) => [card.id, card]));

  for (const [id, override] of Object.entries(overrides)) {
    const card = byId.get(Number(id));
    if (!card) throw new Error(`Override for unknown card id ${id}`);
    const { reason: _reason, deckCardNumber: _deck, ...fields } = override;
    byId.set(card.id, CardSchema.parse({ ...card, ...fields }));
  }

  const rootOf = (card: Card): Card => {
    const seen = new Set<number>();
    let current = card;
    while (current.parentId !== null) {
      if (seen.has(current.id))
        throw new Error(`Parent cycle at card id ${card.id}`);
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent)
        throw new Error(
          `Card id ${current.id} has unknown parent ${current.parentId}`,
        );
      current = parent;
    }
    return current;
  };

  return cards.map((original) => {
    const card = byId.get(original.id) ?? original;
    const deckCardNumber =
      overrides[String(card.id)]?.deckCardNumber ??
      stripPrintMarkers(rootOf(card).cardNumber);
    return CardSchema.parse({ ...card, deckCardNumber });
  });
}
