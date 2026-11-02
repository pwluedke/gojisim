import {
  type Card,
  getCardAbilities,
  getCardText,
  getCardTraits,
} from "@gojisim/cards";

/**
 * The Deckbuilder's card pool and filters (#157). The pool is every English print of a monster,
 * battle or strategy card (Tokens and rage cards aren't deck cards), one entry per deck card
 * number with its prints as the art choice. Filtering runs in memory; the filters round-trip
 * through the URL so a filtered view can be shared.
 */

export type DeckCardType = "Monster" | "Battle" | "Strategy";
export const CARD_TYPES: readonly DeckCardType[] = [
  "Monster",
  "Battle",
  "Strategy",
];

export interface PoolEntry {
  /** The number a deck list uses (`ESD01-001`); every print of the card shares it. */
  deckCardNumber: string;
  /** The base print: its name, text, rank, traits and colors stand for the card. */
  card: Card;
  /** Every English print, the base first, then the parallels by card number (the art choice). */
  prints: Card[];
  /** Lowercased name, text and traits, for the search box. */
  search: string;
  keywords: string[];
}

const english = (c: Card) => c.unknownFields["Language"] === undefined;
const deckType = (c: Card): c is Card & { type: DeckCardType } =>
  (CARD_TYPES as readonly string[]).includes(c.type);

/** A card's keywords and gates from its ability data (Burst, Evolution, Awakening …). */
export function keywordsOf(deckCardNumber: string): string[] {
  const found = new Set<string>();
  for (const ability of getCardAbilities(deckCardNumber)
    .abilities as unknown as Record<string, unknown>[]) {
    const keyword = ability["keyword"] as { name?: string } | undefined;
    if (ability["kind"] === "keyword" && keyword?.name) found.add(keyword.name);
    for (const gate of (ability["gates"] as { gate?: string }[] | undefined) ??
      [])
      if (gate.gate) found.add(gate.gate);
  }
  return [...found].sort();
}

/** The pool from the full card list. */
export function buildPool(cards: readonly Card[]): PoolEntry[] {
  const byNumber = new Map<string, Card[]>();
  for (const c of cards) {
    if (!english(c) || !deckType(c) || getCardTraits(c).includes("Token"))
      continue;
    const prints = byNumber.get(c.deckCardNumber) ?? [];
    prints.push(c);
    byNumber.set(c.deckCardNumber, prints);
  }
  const entries: PoolEntry[] = [];
  for (const [deckCardNumber, prints] of byNumber) {
    prints.sort(
      (a, b) =>
        Number(a.parentId !== null) - Number(b.parentId !== null) ||
        a.cardNumber.localeCompare(b.cardNumber),
    );
    const card = prints[0] as Card;
    entries.push({
      deckCardNumber,
      card,
      prints,
      search: [
        card.name,
        getCardText(card).text,
        ...getCardTraits(card),
        deckCardNumber,
      ]
        .join("\n")
        .toLowerCase(),
      keywords: keywordsOf(deckCardNumber),
    });
  }
  return entries.sort((a, b) =>
    a.deckCardNumber.localeCompare(b.deckCardNumber, "en", { numeric: true }),
  );
}

export interface CardFilter {
  q: string;
  sets: string[];
  colors: string[];
  types: DeckCardType[];
  rankMin: number | null;
  rankMax: number | null;
  trait: string;
  keyword: string;
}

export const NO_FILTER: CardFilter = {
  q: "",
  sets: [],
  colors: [],
  types: [],
  rankMin: null,
  rankMax: null,
  trait: "",
  keyword: "",
};

/** The set a card belongs to for the filter: its deck card number's prefix (`EBP01`). */
export const setOf = (entry: PoolEntry) =>
  entry.deckCardNumber.split("-")[0] ?? "";

/** The entries every filter accepts (they combine; an empty filter accepts everything). */
export function applyFilter(
  pool: readonly PoolEntry[],
  f: CardFilter,
): PoolEntry[] {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const trait = f.trait.trim().toLowerCase();
  return pool.filter((e) => {
    const c = e.card;
    if (words.some((w) => !e.search.includes(w))) return false;
    if (f.sets.length > 0 && !f.sets.includes(setOf(e))) return false;
    if (
      f.colors.length > 0 &&
      !c.colors.some((color) => f.colors.includes(color))
    )
      return false;
    if (f.types.length > 0 && !f.types.includes(c.type as DeckCardType))
      return false;
    if (f.rankMin !== null && (c.rank === null || c.rank < f.rankMin))
      return false;
    if (f.rankMax !== null && (c.rank === null || c.rank > f.rankMax))
      return false;
    if (trait && !getCardTraits(c).some((t) => t.toLowerCase() === trait))
      return false;
    if (f.keyword && !e.keywords.includes(f.keyword)) return false;
    return true;
  });
}

/** The values each filter can take, from the pool (sorted). */
export function facets(pool: readonly PoolEntry[]) {
  const sets = new Set<string>();
  const colors = new Set<string>();
  const traits = new Set<string>();
  const keywords = new Set<string>();
  for (const e of pool) {
    sets.add(setOf(e));
    for (const c of e.card.colors) colors.add(c);
    for (const t of getCardTraits(e.card)) traits.add(t);
    for (const k of e.keywords) keywords.add(k);
  }
  const sorted = (s: Set<string>) =>
    [...s].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return {
    sets: sorted(sets),
    colors: sorted(colors),
    traits: sorted(traits),
    keywords: sorted(keywords),
  };
}

/** The filter as URL search params (only what's set), so a filtered view can be shared. */
export function filterToQuery(f: CardFilter): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.sets.length) p.set("set", f.sets.join(","));
  if (f.colors.length) p.set("color", f.colors.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.rankMin !== null) p.set("rankMin", String(f.rankMin));
  if (f.rankMax !== null) p.set("rankMax", String(f.rankMax));
  if (f.trait.trim()) p.set("trait", f.trait.trim());
  if (f.keyword) p.set("keyword", f.keyword);
  return p.toString();
}

/** The filter from URL search params; unknown or bad values are ignored. */
export function filterFromQuery(query: string): CardFilter {
  const p = new URLSearchParams(query);
  const list = (key: string) =>
    (p.get(key) ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  const rank = (key: string) => {
    const n = Number(p.get(key));
    return p.has(key) && Number.isInteger(n) && n >= 0 && n <= 30 ? n : null;
  };
  return {
    q: p.get("q") ?? "",
    sets: list("set"),
    colors: list("color"),
    types: list("type").filter((t): t is DeckCardType =>
      (CARD_TYPES as readonly string[]).includes(t),
    ),
    rankMin: rank("rankMin"),
    rankMax: rank("rankMax"),
    trait: p.get("trait") ?? "",
    keyword: p.get("keyword") ?? "",
  };
}
