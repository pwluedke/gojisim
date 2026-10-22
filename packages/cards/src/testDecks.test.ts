import { describe, expect, it } from "vitest";
import { type Card, getCardTraits } from "./index";
import { buildTestDeck, MAIN_DECK_SIZE, TEST_DECK_SETS } from "./testDecks";

/** The 6.1.1 checks the M8 deck validator will make (test-only, not the validator). */
function deckProblems(monsterDeck: Card[], mainDeck: Card[]): string[] {
  const problems: string[] = [];
  const ranks = monsterDeck.map((c) => c.rank).sort();
  if (
    monsterDeck.length !== 4 ||
    monsterDeck.some((c) => c.type !== "Monster") ||
    ranks.join() !== "1,2,3,4"
  ) {
    problems.push("6.1.1.1");
  }
  if (mainDeck.length !== MAIN_DECK_SIZE) problems.push("6.1.1.2");
  if (mainDeck.filter((c) => c.invadeZones === 2).length > 10)
    problems.push("6.1.1.2.2");
  const rankOne = monsterDeck.find((c) => c.rank === 1);
  const all = [...monsterDeck, ...mainDeck];
  if (
    !rankOne ||
    all.some(
      (c) =>
        !c.colors.includes("White") &&
        !c.colors.some((x) => rankOne.colors.includes(x)),
    )
  ) {
    problems.push("6.1.1.3");
  }
  const counts = new Map<string, number>();
  for (const card of all)
    counts.set(card.deckCardNumber, (counts.get(card.deckCardNumber) ?? 0) + 1);
  if ([...counts.values()].some((n) => n > 4)) problems.push("6.1.1.4");
  if (all.some((c) => c.traits.includes("Token"))) problems.push("6.1.1.5");
  return problems;
}

describe("buildTestDeck", () => {
  for (const set of TEST_DECK_SETS) {
    it(`6.1.1 the ${set} test deck passes the 6.1.1.1 to 6.1.1.5 checks for many seeds`, () => {
      for (let seed = 0; seed < 25; seed++) {
        const { monsterDeck, mainDeck } = buildTestDeck(set, seed);
        expect(deckProblems(monsterDeck, mainDeck)).toEqual([]);
        expect([...monsterDeck, ...mainDeck].every((c) => c.set === set)).toBe(
          true,
        );
      }
    });

    it(`5.15.1.2 the ${set} monster deck is chained by shared traits, so every counter can promote`, () => {
      const { monsterDeck } = buildTestDeck(set, 1);
      expect(monsterDeck.map((c) => c.rank)).toEqual([1, 2, 3, 4]);
      for (let i = 0; i < 3; i++) {
        const traits = getCardTraits(monsterDeck[i] as Card);
        expect(
          getCardTraits(monsterDeck[i + 1] as Card).some((t) =>
            traits.includes(t),
          ),
        ).toBe(true);
      }
    });
  }

  it("Engine: the same set and seed always give the same deck; another seed usually differs", () => {
    const ids = (seed: number) => {
      const deck = buildTestDeck("ESD01", seed);
      return [...deck.monsterDeck, ...deck.mainDeck].map((c) => c.id);
    };
    expect(ids(5)).toEqual(ids(5));
    expect(ids(5)).not.toEqual(ids(6));
  });

  it("Engine: a set that cannot make a legal deck throws with the reason", () => {
    expect(() => buildTestDeck("FC01", 1)).toThrow(
      /no rank I-IV monster chain|legal main deck/,
    );
    expect(() => buildTestDeck("NOPE", 1)).toThrow(/no playable base cards/);
  });
});
