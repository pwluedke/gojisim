import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectMovieTitles, toCard } from "../src/normalize";
import { parseCardPage } from "../src/parse";

function loadPage(name: string) {
  const html = readFileSync(
    new URL(`fixtures/${name}`, import.meta.url),
    "utf8",
  );
  const page = parseCardPage(html);
  const titles = collectMovieTitles([page]);
  return {
    page,
    cards: page.prints.map((print) => toCard(print, page, titles)),
  };
}

describe("parseCardPage + toCard", () => {
  it("parses a Monster page (EBP01-001) and its variants", () => {
    const { page, cards } = loadPage("monster-EBP01-001.html");
    expect(page.activeId).toBe(113);
    expect(page.table["Threat"]).toBe("5000");

    expect(cards).toHaveLength(3);
    expect(cards[0]).toEqual({
      id: 113,
      cardNumber: "EBP01-001",
      baseCardNumber: "EBP01-001",
      isParallel: false,
      parentId: null,
      deckCardNumber: "EBP01-001",
      name: "Godzilla (1954)",
      set: "EBP01",
      colors: ["Red"],
      type: "Monster",
      rank: 1,
      counterOrThreat: 5000,
      invadeZones: 1,
      rarity: "UC",
      movie: "Godzilla (1954)",
      text:
        "At the beginning of your counter phase, send the top card of your deck to your discard pile.\n" +
        "If it is a monster card, increase this card's [rage] by 1.",
      notes: null,
      imageUrl:
        "https://image.godzillatcgdb.com/img/cards/original/EBP01/113.png",
      unknownFields: { Traits: "Godzilla", "Likes (unlabeled)": "0" },
    });
    expect(cards[1]).toMatchObject({
      id: 112,
      cardNumber: "EBP01-001+",
      parentId: 113,
      baseCardNumber: "EBP01-001",
      isParallel: true,
      rarity: "SP",
      movie: "Godzilla (1954)",
      unknownFields: { Traits: "Godzilla" },
    });
    // Promo reprint: listed under set PR, numbered as a parallel of the EBP01 card.
    expect(cards[2]).toMatchObject({
      id: 665,
      cardNumber: "EBP01-001+",
      parentId: 113,
      baseCardNumber: "EBP01-001",
      isParallel: true,
      set: "PR",
      rarity: "PRP",
      notes:
        "Available through Promo Set #5 from March 2026 through April 2026.",
      imageUrl: "https://image.godzillatcgdb.com/img/cards/original/PR/665.png",
    });
  });

  it("parses a Battle page (EBP01-016)", () => {
    const { page, cards } = loadPage("battle-EBP01-016.html");
    expect(page.table["Counter Power"]).toBe("1000");
    expect(cards.map((c) => c.cardNumber)).toEqual(["EBP01-016", "EBP01-016+"]);
    expect(cards[0]).toMatchObject({
      id: 144,
      name: "Ebirah (2004)",
      type: "Battle",
      rank: 1,
      counterOrThreat: 1000,
      invadeZones: 1,
      rarity: "C",
      movie: "Godzilla Final Wars (2004)",
      text: "",
      unknownFields: { Traits: "Ebirah, Final Wars", "Likes (unlabeled)": "0" },
    });
    expect(cards[1]).toMatchObject({ id: 143, isParallel: true, rarity: "P" });
  });

  it("parses a Strategy page (EBP01-030), including the unlabeled like count", () => {
    const { page, cards } = loadPage("strategy-EBP01-030.html");
    expect(page.likes).toBe("0");
    expect(page.table["Released In"]).toBe("");
    expect(cards.map((c) => [c.id, c.cardNumber, c.set, c.rarity])).toEqual([
      [172, "EBP01-030", "EBP01", "R"],
      [171, "EBP01-030+", "EBP01", "SP"],
      [467, "EBP01-030++", "PR", "PRSP"],
    ]);
    expect(cards[0]).toMatchObject({
      name: "Godzilla Landing",
      type: "Strategy",
      colors: ["Red"],
      rank: 3,
      counterOrThreat: null,
      invadeZones: 1,
      movie: "Godzilla Minus One (2023)",
      text: "Advance the opponent's monster card by 1 zone.",
      notes: null,
      unknownFields: { "Likes (unlabeled)": "0" },
    });
    expect(cards[2]).toMatchObject({
      baseCardNumber: "EBP01-030",
      isParallel: true,
    });
  });
});
