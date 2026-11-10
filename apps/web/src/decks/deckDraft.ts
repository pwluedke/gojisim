import { seededRng } from "@gojisim/bot";
import { type Card, MAX_INVASION_2, validateDeck } from "@gojisim/cards";
import { STARTING_HAND_SIZE } from "@gojisim/engine";
import { formatDeckList, type NamedDeck } from "@gojisim/cards/deck-lists";

/**
 * The deck being built in the Deckbuilder (#158): the monster deck and the main deck, as the
 * cards themselves, so the chosen print (its art) is the one in the deck list. Pure helpers.
 */
export interface DeckDraft {
  name: string;
  monsterDeck: Card[];
  mainDeck: Card[];
  /** The deck's tags (Paul, Nov 9: tags in place of folders); kept through save and export. */
  tags?: string[];
  /** Where the deck came from, written as a `# origin:` comment. */
  origin?: string;
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
  const short = MAIN_DECK_SIZE - draft.mainDeck.length;
  const reasons = failures.flatMap((f) =>
    f.reasons.map((text) => ({
      rule: f.rule,
      // #165: a short main deck reads as its empty slots (6.1.1.2).
      text:
        f.rule === "6.1.1.2" && short > 0 && text.startsWith("Main deck:")
          ? `${short} main deck ${short === 1 ? "slot is" : "slots are"} empty`
          : text,
    })),
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
  ...(draft.tags?.length ? { tags: draft.tags } : {}),
  ...(draft.origin ? { origin: draft.origin } : {}),
});

/** The draft as GojiSim deck list text (what Export writes and Import reads). */
export const draftText = (draft: DeckDraft): string =>
  formatDeckList([asDeck(draft)]);

/** A named deck as a draft. */
export const draftOf = (deck: NamedDeck): DeckDraft => ({
  name: deck.name,
  monsterDeck: [...deck.monsterDeck],
  mainDeck: [...deck.mainDeck],
  ...(deck.tags?.length ? { tags: [...deck.tags] } : {}),
  ...(deck.origin ? { origin: deck.origin } : {}),
});

/** The name for a copy: "<name> (copy)", then "(copy 2)" … while taken. */
export function copyName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${name} (copy)` : `${name} (copy ${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Copies of a card (any print of `deckCardNumber`) in the whole deck, the count 6.1.1.4 limits. */
export const copiesOf = (draft: DeckDraft, deckCardNumber: string): number =>
  [...draft.monsterDeck, ...draft.mainDeck].filter(
    (c) => c.deckCardNumber === deckCardNumber,
  ).length;

/**
 * #165: the draft with one copy of a card (any print) taken out: the last one added to the main
 * deck, else from the monster deck.
 */
export function removeCopy(
  draft: DeckDraft,
  deckCardNumber: string,
): DeckDraft {
  for (const zone of ["main", "monster"] as const) {
    const list = zone === "main" ? draft.mainDeck : draft.monsterDeck;
    const at = list.map((c) => c.deckCardNumber).lastIndexOf(deckCardNumber);
    if (at >= 0) return removeCard(draft, zone, list[at]?.cardNumber ?? "");
  }
  return draft;
}

/** #165 Add 4: copies of `card` added until the deck holds `limit` of it (none past the limit). */
export function fillTo(draft: DeckDraft, card: Card, limit: number): DeckDraft {
  let next = draft;
  while (copiesOf(next, card.deckCardNumber) < limit)
    next = addCard(next, card);
  return next;
}

/** #165 Slots: one entry per copy, by rank (no rank last), then name, then card number. */
export function slotOrder(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      (a.rank ?? 99) - (b.rank ?? 99) ||
      a.name.localeCompare(b.name) ||
      a.cardNumber.localeCompare(b.cardNumber),
  );
}

export const RANK_COLUMNS = 8;

/** #165 Rank columns: ranks 1 to 8, each copy in its rank's column (a rank past 8 goes in 8). */
export function rankColumns(cards: readonly Card[]): Card[][] {
  const columns: Card[][] = Array.from({ length: RANK_COLUMNS }, () => []);
  for (const card of slotOrder(cards)) {
    const rank = Math.min(Math.max(card.rank ?? 1, 1), RANK_COLUMNS);
    columns[rank - 1]?.push(card);
  }
  return columns;
}

/** #165: the main deck's Battle and Strategy counts, and each color's card count. */
export function deckCounts(draft: DeckDraft): {
  battle: number;
  strategy: number;
  colors: [string, number][];
} {
  const colors = new Map<string, number>();
  for (const card of draft.mainDeck)
    for (const color of card.colors)
      colors.set(color, (colors.get(color) ?? 0) + 1);
  return {
    battle: draft.mainDeck.filter((c) => c.type === "Battle").length,
    strategy: draft.mainDeck.filter((c) => c.type === "Strategy").length,
    colors: [...colors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

/** #159: card types counted in the main deck's stats and rank curve. */
export const STAT_TYPES = ["Monster", "Battle", "Strategy"] as const;
export type StatType = (typeof STAT_TYPES)[number];

/**
 * #159: the main deck's stats. Card types, each color's count, the rank curve (ranks 1 to 8, by
 * type), and the cards with invasion icon 2 against the deck's limit (6.1.1.2.2). The monster
 * deck isn't counted: it always holds ranks I to IV.
 */
export function deckStats(draft: DeckDraft): {
  types: Record<StatType, number>;
  colors: [string, number][];
  curve: { rank: number; byType: Record<StatType, number> }[];
  icon2: number;
  icon2Limit: number;
} {
  const types: Record<StatType, number> = {
    Monster: 0,
    Battle: 0,
    Strategy: 0,
  };
  const curve = Array.from({ length: 8 }, (_, i) => ({
    rank: i + 1,
    byType: { Monster: 0, Battle: 0, Strategy: 0 } as Record<StatType, number>,
  }));
  for (const card of draft.mainDeck) {
    const type = card.type as StatType;
    if (!(type in types)) continue;
    types[type]++;
    const row = card.rank === null ? undefined : curve[card.rank - 1];
    if (row) row.byType[type]++;
  }
  return {
    types,
    colors: deckCounts(draft).colors,
    curve,
    icon2: draft.mainDeck.filter((c) => c.invadeZones === 2).length,
    icon2Limit: MAX_INVASION_2,
  };
}

/**
 * #159: a sample opening hand: the top 5 cards (6.3.1.5) of the main deck after a shuffle seeded
 * by `seed`, so the same seed draws the same hand.
 */
export function sampleHand(draft: DeckDraft, seed: string): Card[] {
  const deck = [...draft.mainDeck];
  const rng = seededRng(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j] as Card, deck[i] as Card];
  }
  return deck.slice(0, STARTING_HAND_SIZE);
}
