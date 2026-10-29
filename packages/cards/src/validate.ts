import { getCardAbilities } from "./abilities";
import { getCardTraits } from "./errata";
import { getChoiceRestrictions, getRestriction } from "./restrictions";
import type { Card } from "./schema";

export const MAIN_DECK_SIZE = 50;
export const MAX_COPIES_PER_CARD = 4;
export const MAX_INVASION_2 = 10;

/** The two parts of a deck (6.1.1). */
export interface Deck {
  monsterDeck: Card[];
  mainDeck: Card[];
}

export interface DeckFailure {
  /** Rule number (e.g. "6.1.1.4"), or "Restriction list" / "Choice restriction". */
  rule: string;
  message: string;
  /**
   * The same failure in plain words, one line per card where it names cards (M13b): "Gravity Beam
   * (EBP01-079): banned since Sep 1, 2026". The "Illegal deck" badges show these.
   */
  reasons: string[];
}

export interface DeckValidation {
  legal: boolean;
  /** Every failed check, not only the first. */
  failures: DeckFailure[];
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items)
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

const label = (card: Card) => `${card.cardNumber} ${card.name}`;
/** A card as the plain reasons name it: "Gravity Beam (EBP01-079)". */
const named = (card: Card) => `${card.name} (${card.deckCardNumber})`;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
/** `2026-09-01` as "Sep 1, 2026". */
const longDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`;
};
/** "a", "a and b", "a, b and c". */
const and = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const unique = (cards: Card[]) => [
  ...new Map(cards.map((c) => [c.deckCardNumber, c])).values(),
];
const copiesOf = (count: number, number: string) =>
  `${count} ${count === 1 ? "copy" : "copies"} of ${number}`;

/**
 * Checks a deck against the deck construction rules in force on `asOf` (spec "Deck validator
 * checks"): 6.1.1.1 to 6.1.1.5, the restriction lists and choice restrictions (M1c data).
 * Resonance (6.1.2, 12.8) reads the rank I monster's deck rules (M12c-2). Paul's ruling: an
 * illegal deck can still be played; callers show the failures as a warning.
 */
export function validateDeck(deck: Deck, asOf: Date): DeckValidation {
  const failures: DeckFailure[] = [];
  const fail = (rule: string, message: string, reasons: string[]) =>
    failures.push({ rule, message, reasons });
  const { monsterDeck, mainDeck } = deck;
  const all = [...monsterDeck, ...mainDeck];
  const byNumber = new Map(all.map((c) => [c.deckCardNumber, c]));
  const nameOf = (number: string) => {
    const card = byNumber.get(number);
    return card ? named(card) : number;
  };

  // 6.1.1.1: exactly 4 monster cards, one each of rank I to IV.
  const ranks = monsterDeck.map((c) => (c.type === "Monster" ? c.rank : null));
  const nonMonsters = monsterDeck.filter((c) => c.type !== "Monster");
  if (
    monsterDeck.length !== 4 ||
    nonMonsters.length > 0 ||
    [1, 2, 3, 4].some((r) => !ranks.includes(r))
  ) {
    const parts = [
      `${monsterDeck.length} cards`,
      `ranks ${ranks.map((r) => r ?? "-").join(", ") || "none"}`,
    ];
    if (nonMonsters.length > 0)
      parts.push(`not monster cards: ${nonMonsters.map(label).join(", ")}`);
    fail(
      "6.1.1.1",
      `Monster deck needs one monster card each of rank I, II, III and IV (has ${parts.join("; ")})`,
      [
        `Monster deck: ${monsterDeck.length} ${monsterDeck.length === 1 ? "card" : "cards"}, needs one monster card each of rank I to IV`,
        ...unique(nonMonsters).map(
          (c) => `${named(c)} isn't a monster card (monster deck)`,
        ),
      ],
    );
  }

  // 6.1.1.2: exactly 50 cards in the main deck (monster cards allowed, 6.1.1.2.1).
  if (mainDeck.length !== MAIN_DECK_SIZE) {
    fail(
      "6.1.1.2",
      `Main deck needs exactly ${MAIN_DECK_SIZE} cards (has ${mainDeck.length})`,
      [`Main deck: ${mainDeck.length} cards, needs exactly ${MAIN_DECK_SIZE}`],
    );
  }

  // 6.1.1.2.2: at most 10 main deck cards with invasion icon 2.
  const icon2 = mainDeck.filter((c) => c.invadeZones === 2).length;
  if (icon2 > MAX_INVASION_2) {
    fail(
      "6.1.1.2.2",
      `Main deck has ${icon2} cards with invasion icon 2 (at most ${MAX_INVASION_2})`,
      [`${icon2} cards with invasion icon 2, limit ${MAX_INVASION_2}`],
    );
  }

  // 6.1.1.3: every card is White or shares a color with the rank I monster. A multi-color card
  // passes if any of its colors matches (Paul's ruling). A rank I monster with Resonance also
  // allows its colors and adds its condition list (6.1.2, 12.8.2).
  const rankOne = monsterDeck.find((c) => c.type === "Monster" && c.rank === 1);
  if (rankOne) {
    const resonance = getCardAbilities(rankOne.deckCardNumber).deckRules?.find(
      (r) => r.rule === "resonance",
    );
    const allowed = [
      ...rankOne.colors,
      ...(resonance?.rule === "resonance" ? resonance.colors : []),
    ];
    const offColor = all.filter(
      (c) =>
        !c.colors.includes("White") &&
        !c.colors.some((color) => allowed.includes(color)),
    );
    if (offColor.length > 0) {
      const names = [...new Set(offColor.map(label))].join(", ");
      const colors = [...new Set(allowed)];
      const which =
        colors.length === 0
          ? "has no color the rank I monster allows"
          : `doesn't include ${colors.join(" or ")} (the rank I monster's ${colors.length === 1 ? "color" : "colors"})`;
      fail(
        "6.1.1.3",
        `Cards must be White or ${colors.join("/") || "colorless"} like the rank I monster: ${names}`,
        unique(offColor).map((c) => `${named(c)} isn't white and ${which}`),
      );
    }
    if (resonance?.rule === "resonance")
      for (const condition of resonance.conditions) {
        if ("every" in condition) {
          const breaking = all.filter((c) => {
            if (c.type !== condition.every) return false;
            const traits = getCardTraits(c);
            return (
              (condition.anyTraits !== undefined &&
                !condition.anyTraits.some((t) => traits.includes(t))) ||
              (condition.minRank !== undefined &&
                (c.rank ?? 0) < condition.minRank)
            );
          });
          if (breaking.length > 0)
            fail(
              "12.8.2",
              `Resonance (${rankOne.cardNumber}): ${condition.text}: ${[...new Set(breaking.map(label))].join(", ")}`,
              unique(breaking).map(
                (c) =>
                  `${named(c)} breaks ${named(rankOne)}'s Resonance: ${condition.text}`,
              ),
            );
        } else {
          const count = all.filter((c) => c.type === condition.cards).length;
          if (count < condition.atLeast)
            fail(
              "12.8.2",
              `Resonance (${rankOne.cardNumber}): ${condition.text} (has ${count})`,
              [
                `${named(rankOne)}'s Resonance: ${condition.text} (has ${count})`,
              ],
            );
        }
      }
  }

  // 6.1.1.4: at most 4 copies per card number across both decks; "+" is ignored (6.1.1.4.1).
  // A card whose text allows any number of copies lifts the limit (1.3.1, Q13).
  const copies = countBy(all, (c) => c.deckCardNumber);
  for (const [number, count] of copies) {
    const anyNumber = getCardAbilities(number).deckRules?.some(
      (r) => r.rule === "anyNumber",
    );
    if (count > MAX_COPIES_PER_CARD && !anyNumber)
      fail(
        "6.1.1.4",
        `${copiesOf(count, number)} (at most ${MAX_COPIES_PER_CARD})`,
        [`${nameOf(number)}: ${count} copies, limit ${MAX_COPIES_PER_CARD}`],
      );
  }

  // 6.1.1.5: no card with the Token trait.
  const tokens = all.filter((c) => getCardTraits(c).includes("Token"));
  if (tokens.length > 0)
    fail(
      "6.1.1.5",
      `Token cards can't be in a deck: ${[...new Set(tokens.map(label))].join(", ")}`,
      unique(tokens).map((c) => {
        const n = tokens.filter(
          (t) => t.deckCardNumber === c.deckCardNumber,
        ).length;
        return `${named(c)}: ${n} ${n === 1 ? "copy" : "copies"}, Token cards can't be in a deck`;
      }),
    );

  // Restriction lists in force on `asOf` (M1c).
  for (const [number, count] of copies) {
    const restriction = getRestriction(number, asOf);
    if (restriction && count > restriction.maxCopies) {
      const since = longDate(restriction.effective);
      fail(
        "Restriction list",
        `${copiesOf(count, number)}; restricted to ${restriction.maxCopies} on ${asOf.toISOString().slice(0, 10)}`,
        [
          restriction.maxCopies === 0
            ? `${nameOf(number)}: banned since ${since}`
            : `${nameOf(number)}: ${count} ${count === 1 ? "copy" : "copies"}, limit ${restriction.maxCopies} since ${since}`,
        ],
      );
    }
  }

  // Choice restrictions: cards from at most one card number of each group.
  for (const group of getChoiceRestrictions(asOf)) {
    const present = group.deckCardNumbers.filter((n) => copies.has(n));
    if (present.length > 1) {
      fail(
        "Choice restriction",
        `Only one of ${group.deckCardNumbers.join(", ")} may be in a deck (has ${present.join(", ")})`,
        [
          `Choice restriction: ${and(present.map(nameOf))}, only one may be played`,
        ],
      );
    }
  }

  return { legal: failures.length === 0, failures };
}

/** The failed rule numbers of a validation, without duplicates. */
export function failedRules(validation: DeckValidation): string[] {
  return [...new Set(validation.failures.map((f) => f.rule))];
}
