import { type Card, getCardTraits } from "@gojisim/cards";
import { findCardByNumber } from "@gojisim/cards/deck-lists";
import catalog from "../data/archetypes.json";
import { candidatePool } from "./deckGuess";

/**
 * The deck recognizer (#191, bot learning plan step 4), on from Hard up (`recognizer=1`). The
 * opponent's public cards weight the archetypes in `data/archetypes.json` (public meta archetypes,
 * approved by Paul), and each determinization draws the hidden cards toward one archetype's core
 * and common cards before `guessHidden`'s legal fill. A deck that matches none keeps the uniform
 * guess. The weights are worked out again at every determinization from what is public then, so
 * an early misread corrects itself as more cards are played.
 */

/** One catalog line: cards by deck card number, or every monster card with a trait. */
interface EntryData {
  cards?: string[];
  trait?: string;
  count?: [number, number];
}
interface ArchetypeData {
  name: string;
  rankOne: string[];
  core: EntryData[];
  common: EntryData[];
}

export interface Entry {
  cards: Card[];
  count: [number, number];
}
export interface Archetype {
  name: string;
  rankOne: Set<string>;
  core: Entry[];
  common: Entry[];
  /** Every card number named by the archetype, core or common. */
  coreNumbers: Set<string>;
  commonNumbers: Set<string>;
}

/**
 * #199: evidence against "none of these", as likelihood ratios. A public card an archetype lists
 * as core multiplies its weight by `R_CORE`, a common one by `R_COMMON`; any other card is
 * neutral (real lists hold many cards a catalog line doesn't name). A matching rank I monster
 * multiplies by `R_RANK_ONE_HIT`, another rank I by `R_RANK_ONE_MISS` (the strongest signal; it
 * also settles archetypes that share cards, like a Gigan deck's and a SpaceG deck's 23dorah).
 */
export const R_CORE = 4;
export const R_COMMON = 1.5;
export const R_RANK_ONE_HIT = 6;
export const R_RANK_ONE_MISS = 0.2;
/** "None of these" (the uniform guess) keeps this weight, with no evidence for or against it. */
export const PRIOR_NONE = 0.3;
/** The chance a common entry goes in a drawn deck. */
export const COMMON_IN = 0.5;
/** Core entries without a count in the catalog (Monarch: x2-3); common ones x1-2. */
const CORE_COUNT: [number, number] = [2, 3];
const COMMON_COUNT: [number, number] = [1, 2];

let loaded: Archetype[] | null = null;
/** The catalog with its card numbers resolved to cards. */
export function archetypes(): Archetype[] {
  if (loaded) return loaded;
  const monsters = (trait: string) => {
    const byNumber = new Map<string, Card>();
    for (const n of allMonsterNumbers()) {
      const card = findCardByNumber(n);
      if (card && getCardTraits(card).includes(trait))
        byNumber.set(card.deckCardNumber, card);
    }
    return [...byNumber.values()];
  };
  const entry = (e: EntryData, count: [number, number]): Entry => ({
    cards: e.trait
      ? monsters(e.trait)
      : (e.cards ?? []).flatMap((n) => {
          const card = findCardByNumber(n);
          if (!card) throw new Error(`archetypes.json: unknown card ${n}`);
          return [card];
        }),
    count: e.count ?? count,
  });
  loaded = (catalog.archetypes as ArchetypeData[]).map((a) => {
    const core = a.core.map((e) => entry(e, CORE_COUNT));
    const common = a.common.map((e) => entry(e, COMMON_COUNT));
    const numbers = (entries: Entry[]) =>
      new Set(entries.flatMap((e) => e.cards.map((c) => c.deckCardNumber)));
    return {
      name: a.name,
      rankOne: new Set(a.rankOne),
      core,
      common,
      coreNumbers: numbers(core),
      commonNumbers: numbers(common),
    };
  });
  return loaded;
}

/** Monster deck card numbers in the English pool (for trait entries). */
function allMonsterNumbers(): string[] {
  return candidatePool(undefined, new Date())
    .filter((c) => c.type === "Monster")
    .map((c) => c.deckCardNumber);
}

export interface Weighted {
  /** `null`: a deck outside the catalog (the uniform guess). */
  archetype: Archetype | null;
  weight: number;
}

/**
 * Each archetype's weight (summing to 1) from the opponent's public cards: their rank I monster
 * and every card they have played, discarded or revealed. Cards an archetype can't hold under
 * that rank I (colors, 6.1.1.3) scale it down; one that can hold none of its core is out.
 */
export function archetypeWeights(
  seen: readonly Card[],
  rankOne: Card | undefined,
  asOf: Date,
): Weighted[] {
  const numbers = new Set(
    seen
      .map((c) => c.deckCardNumber)
      .filter((n) => n !== rankOne?.deckCardNumber),
  );
  // A search determinizes once per iteration from the same public cards: work them out once.
  const key = `${rankOne?.deckCardNumber ?? "-"}|${asOf.toISOString().slice(0, 10)}|${[...numbers].sort().join(",")}`;
  const cached = weightCache.get(key);
  if (cached) return cached;
  if (weightCache.size > 256) weightCache.clear();
  const pool = new Set(
    candidatePool(rankOne, asOf).map((c) => c.deckCardNumber),
  );
  const all = archetypes();
  const raw: Weighted[] = all.map((a) => {
    const core = [...a.coreNumbers];
    const legal = core.filter((n) => pool.has(n)).length / (core.length || 1);
    let w = ((1 - PRIOR_NONE) / all.length) * legal;
    if (rankOne)
      w *= a.rankOne.has(rankOne.deckCardNumber)
        ? R_RANK_ONE_HIT
        : R_RANK_ONE_MISS;
    // Each catalog line counts once, however many of its cards show: a trait line ("King
    // Ghidorah monster cards") or a copy of a card adds no more than one card would.
    for (const e of a.core)
      if (e.cards.some((c) => numbers.has(c.deckCardNumber))) w *= R_CORE;
    for (const e of a.common)
      if (e.cards.some((c) => numbers.has(c.deckCardNumber))) w *= R_COMMON;
    return { archetype: a, weight: w };
  });
  raw.push({ archetype: null, weight: PRIOR_NONE });
  const total = raw.reduce((s, x) => s + x.weight, 0);
  const weights = raw.map((x) => ({
    ...x,
    weight: total > 0 ? x.weight / total : 0,
  }));
  weightCache.set(key, weights);
  return weights;
}
const weightCache = new Map<string, Weighted[]>();

/** One archetype by weight, or `null` for the uniform guess. */
export function pickArchetype(
  weights: readonly Weighted[],
  rng: () => number,
): Archetype | null {
  let roll = rng();
  for (const { archetype, weight } of weights)
    if ((roll -= weight) < 0) return archetype;
  return null;
}

/**
 * The cards to place first for an archetype: each core entry's count (less the copies already
 * seen), then each common entry with chance `COMMON_IN`. `guessHidden` keeps only those with
 * room in a legal deck and fills the rest as before.
 */
export function archetypeCards(
  archetype: Archetype,
  seen: readonly Card[],
  rng: () => number,
): Card[] {
  const have = new Map<string, number>();
  for (const c of seen)
    have.set(c.deckCardNumber, (have.get(c.deckCardNumber) ?? 0) + 1);
  const out: Card[] = [];
  const take = (e: Entry) => {
    if (e.cards.length === 0) return;
    const [lo, hi] = e.count;
    let n = lo + Math.floor(rng() * (hi - lo + 1));
    n -= e.cards.reduce((s, c) => s + (have.get(c.deckCardNumber) ?? 0), 0);
    for (let i = 0; i < n; i++)
      out.push(e.cards[Math.floor(rng() * e.cards.length)] as Card);
  };
  for (const e of archetype.core) take(e);
  for (const e of archetype.common) if (rng() < COMMON_IN) take(e);
  return out;
}
