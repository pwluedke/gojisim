import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Card,
  MANUAL_CARD_ID_START,
  ManualCardsSchema,
  mergeManualCards,
} from "../src/schema";

const dataDir = new URL("../data/", import.meta.url);
const read = (file: string) =>
  JSON.parse(readFileSync(new URL(file, dataDir), "utf8")) as unknown;
const manual = ManualCardsSchema.parse(read("manual-cards.json"));
const cards = read("cards.json") as Card[];

describe("hand-entered cards (manual-cards.json)", () => {
  it("each one is in cards.json exactly as entered, with a recorded source file", () => {
    for (const { card, source } of manual) {
      expect(cards.filter((c) => c.cardNumber === card.cardNumber)).toEqual([
        card,
      ]);
      expect(readFileSync(new URL(source.file, dataDir), "utf8")).toContain(
        source.image,
      );
    }
  });

  it("their ids are out of the site's range, so a scraped card never collides", () => {
    const siteIds = cards
      .filter((c) => !manual.some((m) => m.card.id === c.id))
      .map((c) => c.id);
    expect(Math.max(...siteIds)).toBeLessThan(MANUAL_CARD_ID_START);
    expect(manual.every((m) => m.card.id >= MANUAL_CARD_ID_START)).toBe(true);
  });

  it("a later scrape that finds the card on the site keeps the site's print only, and says so", () => {
    const [entry] = manual;
    const site: Card = {
      ...entry!.card,
      id: 950,
      imageUrl: "https://image.godzillatcgdb.com/x.png",
    };
    // What the site lists today: every card but the hand-entered ones.
    const scraped = cards.filter(
      (c) => !manual.some((m) => m.card.id === c.id),
    );
    const before = mergeManualCards(scraped, manual);
    expect(before.nowOnSite).toEqual([]);
    expect(before.cards).toHaveLength(cards.length);
    expect(before.cards.filter((c) => c.cardNumber === "EPR-020")).toEqual([
      entry!.card,
    ]);
    const after = mergeManualCards([...scraped, site], manual);
    expect(after.nowOnSite).toEqual(["EPR-020"]);
    expect(after.cards.filter((c) => c.cardNumber === "EPR-020")).toEqual([
      site,
    ]);
    expect(after.cards).toHaveLength(cards.length);
  });

  it("6.1.1.4, 2.11.3: EPR-020 is its own deck card number, not EBP03-016 (Paul, Oct 24, 2026)", () => {
    const epr = cards.find((c) => c.cardNumber === "EPR-020");
    expect(epr).toMatchObject({
      deckCardNumber: "EPR-020",
      parentId: null,
      name: "Godzilla (2003)",
      type: "Monster",
      rank: 3,
      colors: ["Blue"],
      counterOrThreat: 17000,
      invadeZones: 2,
      traits: ["Godzilla"],
    });
  });
});
