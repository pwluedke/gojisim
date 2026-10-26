import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAllCards } from "../src/allCards";
import { type DecklogDeck, decklogDeckList } from "../src/decklog";
import { findCardByNumber, parseDeckList } from "../src/deckLists";
import { getMaxCopies } from "../src/restrictions";
import { validateDeck } from "../src/validate";

/**
 * The English promos EPR-015 to EPR-019, hand-entered from the official card data (Oct 25, 2026),
 * and the PR print of EBP01-073 from the same site.
 */

const asOf = new Date("2026-10-25");
const byNumber = (n: string) => {
  const card = findCardByNumber(n);
  if (!card) throw new Error(`no ${n}`);
  return card;
};

describe("English promos EPR-015 to EPR-019", () => {
  it("each card number resolves in a deck list", () => {
    const text = [
      "[deck] EPR promos",
      "[main deck]",
      ...["EPR-015", "EPR-016", "EPR-017", "EPR-018", "EPR-019"].map(
        (n) => `1 ${n}`,
      ),
    ].join("\n");
    const { decks, errors } = parseDeckList(text);
    expect(errors).toEqual([]);
    expect(decks[0]?.mainDeck.map((c) => c.deckCardNumber)).toEqual([
      "EPR-015",
      "EPR-016",
      "EPR-017",
      "EPR-018",
      "EPR-019",
    ]);
  });

  it("6.1.1.4: PR-015 and PR-016 are the same cards as EPR-015 and EPR-016 (Monarch, Oct 25, 2026)", () => {
    for (const [pr, epr] of [
      ["PR-015", "EPR-015"],
      ["PR-016", "EPR-016"],
    ] as const) {
      const a = byNumber(pr);
      const b = byNumber(epr);
      expect(a.deckCardNumber).toBe(epr);
      expect(b.deckCardNumber).toBe(epr);
      for (const key of [
        "name",
        "type",
        "colors",
        "traits",
        "rank",
        "counterOrThreat",
        "invadeZones",
        "text",
      ] as const)
        expect(a[key], `${pr} ${key}`).toEqual(b[key]);
    }
    // No other card shares either deck card number.
    const family = getAllCards().filter((c) =>
      ["EPR-015", "EPR-016"].includes(c.deckCardNumber),
    );
    expect(family.map((c) => c.cardNumber).sort()).toEqual([
      "EPR-015",
      "EPR-016",
      "PR-015",
      "PR-016",
    ]);
  });

  it("6.1.1.4: 2 PR-015 plus 2 EPR-015 are 4 copies of one card; a fifth of either is one too many", () => {
    // One print of each ESD01 card, so only the promos can repeat.
    const filler = [
      ...new Map(
        getAllCards()
          .filter((c) => c.cardNumber.startsWith("ESD01-"))
          .map((c) => [c.deckCardNumber, c]),
      ).values(),
    ];
    const deck = (pr: number, epr: number) => ({
      monsterDeck: [],
      mainDeck: [
        ...Array.from({ length: pr }, () => byNumber("PR-015")),
        ...Array.from({ length: epr }, () => byNumber("EPR-015")),
        ...filler,
      ],
    });
    const copies = (d: ReturnType<typeof deck>) =>
      validateDeck(d, asOf).failures.filter((f) => f.rule === "6.1.1.4");
    expect(copies(deck(2, 2))).toEqual([]);
    expect(copies(deck(3, 2))).toHaveLength(1);
    expect(copies(deck(2, 3))[0]?.message).toContain("EPR-015");
  });

  it("EPR-017, EPR-018 and EPR-019 are new cards with the official data", () => {
    expect(byNumber("EPR-017")).toMatchObject({
      name: "Godzilla (Godzilla the Ride: Great Clash)",
      type: "Battle",
      colors: ["Green"],
      rank: 5,
      counterOrThreat: 4000,
      invadeZones: 1,
      traits: ["Godzilla", "Godzilla The Ride"],
      text: "[enter] Place 1 card with [godzilla-the-ride] from your discard pile under your monster card.",
    });
    expect(byNumber("EPR-018")).toMatchObject({
      type: "Strategy",
      colors: ["Blue"],
      rank: 5,
      counterOrThreat: null,
      traits: ["Godzilla The Ride"],
    });
    expect(byNumber("EPR-019")).toMatchObject({
      name: "Gravity Beam",
      type: "Strategy",
      colors: ["White"],
      rank: 7,
      invadeZones: 2,
      traits: ["Fest"],
    });
  });

  it("6.1.1.4: EPR-019 Gravity Beam is its own card, so EBP01-079's restriction (0 copies) doesn't reach it", () => {
    expect(byNumber("EPR-019").deckCardNumber).toBe("EPR-019");
    expect(getMaxCopies("EBP01-079", asOf)).toBe(0);
    expect(getMaxCopies("EPR-019", asOf)).toBe(4);
  });

  it("6.1.1.4.1: the PR print of EBP01-073 (printed title GODZILLA THE RIDE: GREAT CLASH) counts as EBP01-073", () => {
    const pr = getAllCards().find((c) => c.cardNumber === "EBP01-073+ (Alt)");
    const base = byNumber("EBP01-073");
    expect(pr).toMatchObject({
      set: "PR",
      rarity: "PRSP",
      isParallel: true,
      parentId: base.id,
      deckCardNumber: "EBP01-073",
      name: base.name,
      text: base.text,
    });
  });

  it("Decklog deck 1MUWV (EPR-015, EPR-016 and EPR-017) reads with no unknown cards and is legal", () => {
    const raw = JSON.parse(
      readFileSync(
        new URL("fixtures/decklog-1MUWV.json", import.meta.url),
        "utf8",
      ),
    ) as DecklogDeck & { deck_id: string };
    const list = decklogDeckList({ ...raw, code: raw.deck_id });
    expect(list.unknown).toEqual([]);
    expect(list.text).toMatch(/^4 EPR-017$/m);
    const { decks, errors } = parseDeckList(list.text);
    expect(errors).toEqual([]);
    const [read] = decks;
    const numbers = [...read!.monsterDeck, ...read!.mainDeck].map(
      (c) => c.deckCardNumber,
    );
    for (const n of ["EPR-015", "EPR-016", "EPR-017"])
      expect(numbers, n).toContain(n);
    expect(validateDeck(read!, asOf).failures).toEqual([]);
  });
});
