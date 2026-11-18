import { describe, expect, it } from "vitest";
import { getCardAbilities, registerAbilities } from "./abilities";
import { cardsVersion, getAllCards, registerCards } from "./allCards";
import { findCardByNumber, parseDeckList } from "./deckLists";
import { getTokenCard } from "./tokens";
import { validateDeck } from "./validate";

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

  it("9.1: a registered token can be created by name", () => {
    expect(() => getTokenCard("Registry Test Token")).toThrow();
    registerCards([
      {
        ...card,
        id: 990002,
        cardNumber: "TST-T01",
        baseCardNumber: "TST-T01",
        deckCardNumber: "TST-T01",
        name: "Registry Test Token",
        type: "Token",
        rank: 1,
        invadeZones: null,
      },
    ]);
    expect(getTokenCard("registry test token").id).toBe(990002);
  });

  it("6.1.2: a rank I monster's deck restriction (no Resonance colors) holds every battle card to its traits", () => {
    const monster = (n: number, rank: number) => ({
      ...card,
      id: 990010 + n,
      cardNumber: `TST-10${n}`,
      baseCardNumber: `TST-10${n}`,
      deckCardNumber: `TST-10${n}`,
      name: `Restriction Test ${n}`,
      type: "Monster",
      traits: ["Island"],
      rank,
      counterOrThreat: 5000,
    });
    const battle = (n: number, traits: string[]) => ({
      ...card,
      id: 990020 + n,
      cardNumber: `TST-12${n}`,
      baseCardNumber: `TST-12${n}`,
      deckCardNumber: `TST-12${n}`,
      name: `Restriction Battle ${n}`,
      traits,
    });
    registerCards([
      monster(1, 1),
      monster(2, 2),
      monster(3, 3),
      monster(4, 4),
      battle(1, ["Island"]),
      battle(2, ["Other"]),
    ]);
    registerAbilities({
      "TST-101": {
        deckCardNumber: "TST-101",
        status: "implemented",
        abilities: [],
        deckRules: [
          {
            rule: "restriction",
            conditions: [
              {
                every: "Battle",
                anyTraits: ["Island"],
                text: "Battle cards must be [island]",
              },
            ],
          },
        ],
      },
    });
    const deck = (battleNumber: string) =>
      parseDeckList(
        `[deck] Restricted\n[monster deck]\n1 TST-101\n1 TST-102\n1 TST-103\n1 TST-104\n[main deck]\n${[1, 2, 3, 4].map((n) => `3 TST-10${n}`).join("\n")}\n4 ${battleNumber}\n`,
      ).decks[0]!;
    const asOf = new Date("2026-11-18T00:00:00Z");
    const failing = validateDeck(deck("TST-122"), asOf).failures.filter(
      (f) => f.rule === "6.1.2",
    );
    expect(failing).toHaveLength(1);
    expect(failing[0]?.reasons.join(" ")).toContain("Restriction Battle 2");
    expect(
      validateDeck(deck("TST-121"), asOf).failures.filter(
        (f) => f.rule === "6.1.2",
      ),
    ).toEqual([]);
  });
});
