import {
  type Card,
  getCardAbilities,
  getCardTraits,
  getChoiceRestrictions,
  getRestriction,
  MAX_COPIES_PER_CARD,
  MAX_INVASION_2,
} from "@gojisim/cards";
import { getAllCards } from "@gojisim/cards/all-cards";

/**
 * The generic deck guess (Q42, bot learning plan step 1). A bot sees only its own decklist: at
 * setup the opponent presents a deck and 4 monsters, never their contents (6.3.1.1, like
 * presenting for a cut). When it fills the opponent's hidden cards, it draws them from the cards
 * a legal deck could hold, given what is public:
 * - colors (6.1.1.3): the rank I monster's, plus White, plus Resonance colors and conditions
 *   (12.8.2);
 * - copies (6.1.1.4) and the restriction list on the game's date, counting cards already seen;
 * - invasion icon 2 (6.1.1.2.2): at most 10, counting those seen;
 * - no Token cards (6.1.1.5);
 * - the monster deck: one card per rank (6.1.1.1), preferring cards that share a trait with the
 *   monsters seen (5.15.1.2) or that a `monsterOnto` rule lets onto them (Q23).
 * The draw is uniform for now; the recognizer (step 4) replaces `guessHidden` with engine odds.
 */

/** What is public about one player's deck. */
export interface PublicDeckInfo {
  /** The rank I monster placed at setup (6.3.1.6), or `undefined` if the log doesn't show it. */
  rankOne: Card | undefined;
  /** Every card seen from this player's decks (main and monster), each copy once. */
  seen: readonly Card[];
  /** Main-deck cards still hidden (hand, deck and anything face down). */
  hiddenMain: number;
  /** Monster deck ranks still hidden, one entry per card. */
  hiddenRanks: readonly number[];
  /** The game's date, for the restriction list. */
  asOf: Date;
}

/** The opponent's hidden cards, as drawn. */
export interface HiddenGuess {
  main: Card[];
  monsterDeck: Card[];
}

/** The English card pool: one base print per deck card number, no Rage or Token cards. */
let pool: Card[] | null = null;
function englishPool(): Card[] {
  if (pool) return pool;
  const byNumber = new Map<string, Card>();
  for (const card of getAllCards())
    if (
      card.parentId === null &&
      (card.type === "Monster" ||
        card.type === "Battle" ||
        card.type === "Strategy") &&
      // Japanese promo prints (PR-001 ...) are outside the English pool; EPR-* are English.
      !card.deckCardNumber.startsWith("PR-") &&
      !getCardTraits(card).includes("Token") &&
      !byNumber.has(card.deckCardNumber)
    )
      byNumber.set(card.deckCardNumber, card);
  pool = [...byNumber.values()];
  return pool;
}

/** A card number's copy limit on `asOf`: 4, a lower restriction, or none ("any number"). */
function copyLimit(card: Card, asOf: Date): number {
  const anyNumber = getCardAbilities(card.deckCardNumber).deckRules?.some(
    (r) => r.rule === "anyNumber",
  );
  const restriction = getRestriction(card.deckCardNumber, asOf);
  const base = anyNumber ? Infinity : MAX_COPIES_PER_CARD;
  return restriction ? Math.min(base, restriction.maxCopies) : base;
}

/** Per-card data a draw reads, worked out once per rank I monster and date. */
interface Candidates {
  /** The cards a deck with this rank I monster may hold on that date. */
  all: Card[];
  byType: Map<string, Card[]>;
  monstersByRank: Map<number, Card[]>;
  /** Copy limit by deck card number (restriction list included). */
  limit: Map<string, number>;
  /** Traits (errata applied) and the traits a `monsterOnto` rule needs, by deck card number. */
  traits: Map<string, string[]>;
  onto: Map<string, string[]>;
  /** Choice restriction groups each card number is in. */
  groups: Map<string, string[][]>;
}

const traitsOf = (card: Card) => getCardTraits(card);
const ontoOf = (card: Card): string[] | undefined => {
  for (const a of getCardAbilities(card.deckCardNumber).abilities)
    if (a.kind === "playRule" && a.monsterOnto?.traits)
      return a.monsterOnto.traits;
  return undefined;
};

/** The cards a deck with this rank I monster may hold on `asOf` (colors, Resonance, limits). */
const cache = new Map<string, Candidates>();
export function candidatePool(rankOne: Card | undefined, asOf: Date): Card[] {
  return candidatesFor(rankOne, asOf).all;
}
function candidatesFor(rankOne: Card | undefined, asOf: Date): Candidates {
  const key = `${rankOne?.deckCardNumber ?? "-"}|${asOf.toISOString().slice(0, 10)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const resonance = rankOne
    ? getCardAbilities(rankOne.deckCardNumber).deckRules?.find(
        (r) => r.rule === "resonance",
      )
    : undefined;
  const allowed = rankOne
    ? [
        ...rankOne.colors,
        ...(resonance?.rule === "resonance" ? resonance.colors : []),
      ]
    : null;
  const every =
    resonance?.rule === "resonance"
      ? resonance.conditions.filter((c) => "every" in c)
      : [];
  const limit = new Map<string, number>();
  const all = englishPool().filter((card) => {
    if (
      allowed &&
      !card.colors.includes("White") &&
      !card.colors.some((color) => allowed.includes(color))
    )
      return false;
    for (const condition of every) {
      if (!("every" in condition) || card.type !== condition.every) continue;
      const traits = getCardTraits(card);
      if (
        condition.anyTraits !== undefined &&
        !condition.anyTraits.some((t) => traits.includes(t))
      )
        return false;
      if (
        condition.minRank !== undefined &&
        (card.rank ?? 0) < condition.minRank
      )
        return false;
    }
    const max = copyLimit(card, asOf);
    limit.set(card.deckCardNumber, max);
    return max > 0;
  });
  const byType = new Map<string, Card[]>();
  const monstersByRank = new Map<number, Card[]>();
  const traits = new Map<string, string[]>();
  const onto = new Map<string, string[]>();
  for (const card of all) {
    byType.set(card.type, [...(byType.get(card.type) ?? []), card]);
    if (card.type === "Monster" && card.rank !== null)
      monstersByRank.set(card.rank, [
        ...(monstersByRank.get(card.rank) ?? []),
        card,
      ]);
    traits.set(card.deckCardNumber, traitsOf(card));
    const needs = ontoOf(card);
    if (needs) onto.set(card.deckCardNumber, needs);
  }
  const groups = new Map<string, string[][]>();
  for (const { deckCardNumbers } of getChoiceRestrictions(asOf))
    for (const n of deckCardNumbers)
      groups.set(n, [...(groups.get(n) ?? []), deckCardNumbers]);
  const result = { all, byType, monstersByRank, limit, traits, onto, groups };
  cache.set(key, result);
  return result;
}

/**
 * Draws the hidden cards of a deck from what is public. Every copy limit counts the cards seen;
 * when the constraints leave nothing to draw (an illegal Casual deck, say), the limits are
 * relaxed rather than failing, so a bot can always decide. A search draws a guess for every
 * determinization, so draws sample and retry instead of filtering the pool each time.
 */
export function guessHidden(
  info: PublicDeckInfo,
  rng: () => number,
): HiddenGuess {
  const c = candidatesFor(info.rankOne, info.asOf);
  const counts = new Map<string, number>();
  const add = (card: Card) =>
    counts.set(card.deckCardNumber, (counts.get(card.deckCardNumber) ?? 0) + 1);
  for (const card of info.seen) add(card);
  let icon2 = info.seen.filter((card) => card.invadeZones === 2).length;
  // Choice restrictions: once a group's card is in the deck, the group's others are out.
  const blocked = (card: Card) =>
    (c.groups.get(card.deckCardNumber) ?? []).some((g) =>
      g.some((n) => n !== card.deckCardNumber && (counts.get(n) ?? 0) > 0),
    );
  const room = (card: Card) =>
    (counts.get(card.deckCardNumber) ?? 0) <
      (c.limit.get(card.deckCardNumber) ?? MAX_COPIES_PER_CARD) &&
    !blocked(card) &&
    (card.invadeZones !== 2 || icon2 < MAX_INVASION_2);
  const pick = (from: readonly Card[]): Card | undefined =>
    from[Math.floor(rng() * from.length)];
  /** A uniform card of `from` with room: a few tries, then the slow filter. */
  const pickOpen = (from: readonly Card[]): Card | undefined => {
    for (let tries = 0; tries < 24; tries++) {
      const card = pick(from);
      if (card && room(card)) return card;
    }
    return pick(from.filter(room));
  };

  // The monster deck: one card per hidden rank, preferring cards that can follow those seen
  // (a shared trait, 5.15.1.2, or a `monsterOnto` rule, Q23).
  const seenTraits = new Set(
    info.seen
      .filter((card) => card.type === "Monster")
      .flatMap((card) => c.traits.get(card.deckCardNumber) ?? traitsOf(card)),
  );
  const follows = (card: Card) =>
    (c.traits.get(card.deckCardNumber) ?? []).some((t) => seenTraits.has(t)) ||
    (c.onto.get(card.deckCardNumber)?.every((t) => seenTraits.has(t)) ?? false);
  const monsterDeck: Card[] = [];
  for (const rank of info.hiddenRanks) {
    const ofRank = (c.monstersByRank.get(rank) ?? []).filter(room);
    const linked = ofRank.filter(follows);
    const card =
      pick(linked.length > 0 ? linked : ofRank) ??
      pick(
        englishPool().filter(
          (card) => card.type === "Monster" && card.rank === rank,
        ),
      );
    if (!card) continue;
    monsterDeck.push(card);
    add(card);
    for (const t of c.traits.get(card.deckCardNumber) ?? []) seenTraits.add(t);
  }

  // The main deck: Resonance minimums first ("at least 10 strategy cards"), then uniform draws.
  const main: Card[] = [];
  const draw = (from: readonly Card[]) => {
    const card = pickOpen(from) ?? pick(from) ?? pick(englishPool());
    if (!card) return;
    main.push(card);
    add(card);
    if (card.invadeZones === 2) icon2++;
  };
  const resonance = info.rankOne
    ? getCardAbilities(info.rankOne.deckCardNumber).deckRules?.find(
        (r) => r.rule === "resonance",
      )
    : undefined;
  if (resonance?.rule === "resonance")
    for (const condition of resonance.conditions)
      if ("atLeast" in condition) {
        const have = info.seen.filter(
          (card) => card.type === condition.cards,
        ).length;
        const need = Math.min(
          info.hiddenMain - main.length,
          Math.max(0, condition.atLeast - have),
        );
        for (let i = 0; i < need; i++)
          draw(c.byType.get(condition.cards) ?? []);
      }
  while (main.length < info.hiddenMain) draw(c.all);
  return { main, monsterDeck };
}
