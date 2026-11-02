import { type Card, validateDeck } from "@gojisim/cards";
import { formatDeckList, type NamedDeck } from "@gojisim/cards/deck-lists";

/**
 * The deck being built in the Deckbuilder (#158): the monster deck and the main deck, as the
 * cards themselves, so the chosen print (its art) is the one in the deck list. Pure helpers.
 */
export interface DeckDraft {
  name: string;
  monsterDeck: Card[];
  mainDeck: Card[];
}

export type DeckZone = "monster" | "main";

export const MONSTER_DECK_SIZE = 4;
export const MAIN_DECK_SIZE = 50;

export const emptyDraft = (name = "New deck"): DeckDraft => ({
  name,
  monsterDeck: [],
  mainDeck: [],
});

/**
 * Where a clicked card goes: a monster to the monster deck while it has room for that rank (one
 * each of rank I to IV, 6.1.1.1), otherwise the main deck (monsters are allowed there, 6.1.1.2.1).
 */
export function zoneFor(draft: DeckDraft, card: Card): DeckZone {
  if (card.type !== "Monster") return "main";
  const full = draft.monsterDeck.length >= MONSTER_DECK_SIZE;
  const rankTaken = draft.monsterDeck.some((c) => c.rank === card.rank);
  return full || rankTaken ? "main" : "monster";
}

/** The draft with one more copy of `card` in `zone` (default: `zoneFor`). */
export function addCard(
  draft: DeckDraft,
  card: Card,
  zone: DeckZone = zoneFor(draft, card),
): DeckDraft {
  return zone === "monster"
    ? { ...draft, monsterDeck: [...draft.monsterDeck, card] }
    : { ...draft, mainDeck: [...draft.mainDeck, card] };
}

/** The draft with one copy of the print `cardNumber` taken out of `zone` (the last one added). */
export function removeCard(
  draft: DeckDraft,
  zone: DeckZone,
  cardNumber: string,
): DeckDraft {
  const list = zone === "monster" ? draft.monsterDeck : draft.mainDeck;
  const at = list.map((c) => c.cardNumber).lastIndexOf(cardNumber);
  if (at < 0) return draft;
  const next = [...list.slice(0, at), ...list.slice(at + 1)];
  return zone === "monster"
    ? { ...draft, monsterDeck: next }
    : { ...draft, mainDeck: next };
}

/** A zone's cards as rows, one per print in the order first added, with its count. */
export function rows(cards: readonly Card[]): { card: Card; count: number }[] {
  const out = new Map<string, { card: Card; count: number }>();
  for (const card of cards) {
    const row = out.get(card.cardNumber);
    if (row) row.count++;
    else out.set(card.cardNumber, { card, count: 1 });
  }
  return [...out.values()];
}

export interface Legality {
  legal: boolean;
  /** Every failed rule in plain words (`validateDeck`'s reasons), the rule number first. */
  reasons: { rule: string; text: string }[];
  /** Deck card numbers a reason names: their rows are marked. */
  marked: Set<string>;
}

/** The draft checked as Tournament games check decks (`validateDeck`, today's restriction list). */
export function legality(draft: DeckDraft, asOf: Date = new Date()): Legality {
  const { legal, failures } = validateDeck(
    { monsterDeck: draft.monsterDeck, mainDeck: draft.mainDeck },
    asOf,
  );
  const reasons = failures.flatMap((f) =>
    f.reasons.map((text) => ({ rule: f.rule, text })),
  );
  const marked = new Set<string>();
  for (const { text } of reasons)
    for (const m of text.matchAll(/\(([A-Z]{2,5}\d{2}-\d{3})\)/g))
      if (m[1]) marked.add(m[1]);
  return { legal, reasons, marked };
}

/** The draft as a named deck (for My decks and export). */
export const asDeck = (draft: DeckDraft): NamedDeck => ({
  name: draft.name.trim() || "New deck",
  monsterDeck: draft.monsterDeck,
  mainDeck: draft.mainDeck,
});

/** The draft as GojiSim deck list text (what Export writes and Import reads). */
export const draftText = (draft: DeckDraft): string =>
  formatDeckList([asDeck(draft)]);

/** A named deck as a draft. */
export const draftOf = (deck: NamedDeck): DeckDraft => ({
  name: deck.name,
  monsterDeck: [...deck.monsterDeck],
  mainDeck: [...deck.mainDeck],
});

/** The name for a copy: "<name> (copy)", then "(copy 2)" … while taken. */
export function copyName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${name} (copy)` : `${name} (copy ${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
