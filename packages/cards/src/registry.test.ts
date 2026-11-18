import { describe, expect, it } from "vitest";
import { getCardAbilities, registerAbilities } from "./abilities";
import { cardsVersion, getAllCards, registerCards } from "./allCards";
import { findCardByNumber, parseDeckList } from "./deckLists";

/** A card that isn't in `cards.json`, as a runtime-registered set would carry it. */
const card = {
  id: 990001,
  cardNumber: "TST-001",
  baseCardNumber: "TST-001",
  isParallel: false,
  parentId: null,
  deckCardNumber: "TST-001",
  name: "Registry Test Card",
  set: "TST",
  colors: ["Red"],
  type: "Battle",
  traits: ["Weapon"],
  rank: 1,
  counterOrThreat: 1000,
  invadeZones: 1,
  rarity: "C",
  movie: null,
  text: "A card registered at runtime.",
  notes: null,
  imageUrl: "https://gojisim.invalid/registry-test/990001.png",
  unknownFields: {},
};

describe("runtime card registration", () => {
  it("adds cards to the card list and the number lookup, once", () => {
    const before = getAllCards().length;
    const version = cardsVersion();
    expect(findCardByNumber("TST-001")).toBeUndefined();
    expect(registerCards([card])).toBe(1);
    expect(getAllCards()).toHaveLength(before + 1);
    expect(cardsVersion()).toBe(version + 1);
    expect(findCardByNumber("TST-001")?.name).toBe("Registry Test Card");
    // The same set again adds nothing.
    expect(registerCards([card])).toBe(0);
    expect(getAllCards()).toHaveLength(before + 1);
  });

  it("lets a deck list name a registered card", () => {
    registerCards([card]);
    const parsed = parseDeckList(
      "[deck] Registry test\n[monster deck]\n1 ESD01-001\n[main deck]\n4 TST-001\n",
    );
    expect(parsed.errors).toEqual([]);
    expect(
      parsed.decks[0]?.mainDeck.filter((c) => c.cardNumber === "TST-001"),
    ).toHaveLength(4);
  });

  it("rejects a card that doesn't fit the schema", () => {
    expect(() => registerCards([{ ...card, id: "x" }])).toThrow();
  });

  it("adds a set's abilities; a known card number isn't replaced", () => {
    expect(getCardAbilities("TST-001").status).toBe("manual");
    expect(
      registerAbilities({
        "TST-001": {
          deckCardNumber: "TST-001",
          status: "implemented",
          abilities: [],
        },
      }),
    ).toBe(1);
    expect(getCardAbilities("TST-001").status).toBe("implemented");
    const esd = getCardAbilities("ESD01-001");
    expect(
      registerAbilities({
        "ESD01-001": {
          deckCardNumber: "ESD01-001",
          status: "manual",
          abilities: [],
        },
      }),
    ).toBe(0);
    expect(getCardAbilities("ESD01-001")).toBe(esd);
    expect(() => registerAbilities({ bad: { nope: true } })).toThrow();
  });
});
