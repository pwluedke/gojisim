import cardsJson from "../data/cards.json";
import { type Card, CardListSchema } from "./schema";

/** Sets `buildTestDeck` is offered for in the debug viewer. */
export const TEST_DECK_SETS = ["ESD01", "ESD02"] as const;

export const MAIN_DECK_SIZE = 50;
export const MAX_COPIES = 4;
export const MAX_INVASION_2 = 10;

export interface TestDeck {
  set: string;
  /** Ranks I to IV, in rank order, each sharing a trait with the next (5.15.1.2). */
  monsterDeck: Card[];
  /** 50 cards, sorted by card number. */
  mainDeck: Card[];
}

let allCards: Card[] | null = null;

/** Every card in `cards.json`, validated once. */
export function getAllCards(): Card[] {
  allCards ??= CardListSchema.parse(cardsJson as unknown);
  return allCards;
}

/** mulberry32: a small deterministic PRNG (same algorithm as the engine's). */
function rng(seed: number | string): () => number {
  let state =
    typeof seed === "number"
      ? Math.trunc(seed) >>> 0
      : [...seed].reduce(
          (h, ch) => Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0,
          0x811c9dc5,
        );
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const sharesTrait = (a: Card, b: Card) =>
  a.traits.some((t) => b.traits.includes(t));

/** A card passes 6.1.1.3 if it is White or has any of the rank I monster's colors (Paul's ruling). */
const colorLegal = (card: Card, rankOne: Card) =>
  card.colors.includes("White") ||
  card.colors.some((c) => rankOne.colors.includes(c));

/**
 * Builds a legal 54-card test deck from one set (6.1.1.1 to 6.1.1.5), choosing at random with
 * `seed`. Only base, English prints of that set are used; White cards of the set are allowed.
 * Throws with the reason if the set can't produce a legal deck.
 */
export function buildTestDeck(set: string, seed: number | string): TestDeck {
  const random = rng(seed);
  const pool = getAllCards().filter(
    (c) =>
      c.set === set &&
      c.parentId === null &&
      c.unknownFields["Language"] === undefined &&
      (c.type === "Monster" || c.type === "Battle" || c.type === "Strategy") &&
      !c.traits.includes("Token"), // 6.1.1.5
  );
  if (pool.length === 0)
    throw new Error(`Set ${set} has no playable base cards`);

  // 6.1.1.1: one monster card of each rank I to IV, each sharing a trait with the next so a
  // counter can always promote (5.15.1.2), and all color-legal for the rank I monster (6.1.1.3).
  const monsters = (rank: number) =>
    pool.filter((c) => c.type === "Monster" && c.rank === rank);
  const chains: Card[][] = [];
  for (const one of monsters(1)) {
    for (const two of monsters(2).filter(
      (c) => sharesTrait(one, c) && colorLegal(c, one),
    )) {
      for (const three of monsters(3).filter(
        (c) => sharesTrait(two, c) && colorLegal(c, one),
      )) {
        for (const four of monsters(4).filter(
          (c) => sharesTrait(three, c) && colorLegal(c, one),
        )) {
          chains.push([one, two, three, four]);
        }
      }
    }
  }
  if (chains.length === 0) {
    const ranks = [1, 2, 3, 4]
      .map((r) => `rank ${r}: ${monsters(r).length}`)
      .join(", ");
    throw new Error(
      `Set ${set} has no rank I-IV monster chain with shared traits (${ranks})`,
    );
  }
  const monsterDeck = chains[Math.floor(random() * chains.length)] as Card[];
  const rankOne = monsterDeck[0] as Card;

  // 6.1.1.4: at most 4 copies per deck card number, counted across both decks.
  const used = new Map<string, number>();
  for (const card of monsterDeck)
    used.set(card.deckCardNumber, (used.get(card.deckCardNumber) ?? 0) + 1);
  const copies: Card[] = [];
  for (const card of pool.filter((c) => colorLegal(c, rankOne))) {
    for (let i = used.get(card.deckCardNumber) ?? 0; i < MAX_COPIES; i++)
      copies.push(card);
  }

  // 6.1.1.2: 50 cards; 6.1.1.2.2: at most 10 with invasion icon 2.
  const mainDeck: Card[] = [];
  let invasionTwo = 0;
  for (const card of shuffled(copies, random)) {
    if (mainDeck.length === MAIN_DECK_SIZE) break;
    if (card.invadeZones === 2) {
      if (invasionTwo === MAX_INVASION_2) continue;
      invasionTwo++;
    }
    mainDeck.push(card);
  }
  if (mainDeck.length < MAIN_DECK_SIZE) {
    throw new Error(
      `Set ${set} has only ${mainDeck.length} legal main deck cards (needs ${MAIN_DECK_SIZE}) after ` +
        `the monster deck, the 4-copy limit and the 10-card invasion 2 limit`,
    );
  }
  mainDeck.sort((a, b) =>
    a.cardNumber < b.cardNumber ? -1 : a.cardNumber > b.cardNumber ? 1 : 0,
  );
  return { set, monsterDeck, mainDeck };
}
