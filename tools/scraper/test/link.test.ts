import type { Card } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import { linkPrints } from "../src/link";

function card(id: number, cardNumber: string, parentId: number | null): Card {
  return {
    id,
    cardNumber,
    baseCardNumber: cardNumber.replace(/\++$/, ""),
    isParallel: cardNumber.endsWith("+"),
    parentId,
    deckCardNumber: cardNumber,
    name: "x",
    set: "PR",
    colors: [],
    type: "Strategy",
    traits: [],
    rank: null,
    counterOrThreat: null,
    invadeZones: null,
    rarity: "C",
    movie: null,
    text: "",
    notes: null,
    imageUrl: `https://image.godzillatcgdb.com/img/cards/original/PR/${id}.png`,
    unknownFields: {},
  };
}

describe("linkPrints", () => {
  it("takes deckCardNumber from the root of the parent chain", () => {
    const linked = linkPrints(
      [
        card(1, "EBP01-001", null),
        card(2, "EBP01-001+", 1),
        card(3, "PR-009 (Alt)", 1),
      ],
      {},
    );
    expect(linked.map((c) => c.deckCardNumber)).toEqual([
      "EBP01-001",
      "EBP01-001",
      "EBP01-001",
    ]);
  });

  it("applies overrides before linking, and an explicit deckCardNumber wins", () => {
    const linked = linkPrints(
      [card(443, "EPR-005+", null), card(896, "EPR-005", 443)],
      {
        "443": { parentId: 896, deckCardNumber: "EPR-005", reason: "test" },
        "896": { parentId: null, reason: "test" },
      },
    );
    expect(linked.map((c) => [c.id, c.parentId, c.deckCardNumber])).toEqual([
      [443, 896, "EPR-005"],
      [896, null, "EPR-005"],
    ]);
  });

  it("rejects parent cycles and unknown ids", () => {
    expect(() => linkPrints([card(1, "A", 2), card(2, "B", 1)], {})).toThrow(
      /cycle/,
    );
    expect(() => linkPrints([card(1, "A", 9)], {})).toThrow(/unknown parent/);
    expect(() =>
      linkPrints([card(1, "A", null)], { "7": { reason: "x" } }),
    ).toThrow(/unknown card id/);
  });
});
