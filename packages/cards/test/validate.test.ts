import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Card, failedRules, validateDeck } from "../src";
import {
  findCardByNumber,
  type NamedDeck,
  parseDeckList,
} from "../src/deckLists";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const TODAY = day("2026-10-21");

function starter(file: string): NamedDeck {
  const { decks } = parseDeckList(
    readFileSync(new URL(`../data/decks/${file}`, import.meta.url), "utf8"),
  );
  return decks[0] as NamedDeck;
}

function card(number: string): Card {
  const found = findCardByNumber(number);
  if (!found) throw new Error(`No card ${number}`);
  return found;
}

/**
 * The ESD01 starter with copies of ESD01-012 (a battle card with invasion icon 2) swapped out for
 * `cards`, so the deck stays at 50 cards and at most 10 with icon 2 (6.1.1.2.2).
 */
function esd01With(...cards: Card[]): NamedDeck {
  const deck = starter("esd01-starter.txt");
  const mainDeck = [...deck.mainDeck];
  for (const added of cards) {
    mainDeck.splice(
      mainDeck.findIndex((c) => c.cardNumber === "ESD01-012"),
      1,
    );
    mainDeck.push(added);
  }
  return { ...deck, mainDeck };
}

const rules = (deck: NamedDeck, asOf = TODAY) =>
  failedRules(validateDeck(deck, asOf));

describe("validateDeck (6.1.1)", () => {
  it("6.1.1 both official starter decks are legal on 2026-10-21", () => {
    for (const file of ["esd01-starter.txt", "esd02-starter.txt"]) {
      expect(validateDeck(starter(file), TODAY)).toEqual({
        legal: true,
        failures: [],
      });
    }
  });

  it("6.1.1.1 a monster deck with two rank II cards is invalid and cites 6.1.1.1 (case 1)", () => {
    const deck = starter("esd01-starter.txt");
    // Two ESD01-002 (rank II) and no rank III; ESD01-002 still has at most 4 copies in all.
    deck.monsterDeck = [
      card("ESD01-001"),
      card("ESD01-002"),
      card("ESD01-002"),
      card("ESD01-004"),
    ];
    const result = validateDeck(deck, TODAY);
    expect(result.legal).toBe(false);
    expect(failedRules(result)).toEqual(["6.1.1.1"]);
  });

  it("6.1.1.2 a main deck of 49 or 51 cards is invalid (case 2)", () => {
    const deck = starter("esd01-starter.txt");
    expect(rules({ ...deck, mainDeck: deck.mainDeck.slice(0, 49) })).toEqual([
      "6.1.1.2",
    ]);
    expect(
      rules({ ...deck, mainDeck: [...deck.mainDeck, card("ESD01-016")] }),
    ).toEqual(["6.1.1.2"]);
  });

  it("6.1.1.2.2 11 cards with invasion icon 2 are invalid; 10 are valid (case 3)", () => {
    const ten = starter("esd01-starter.txt");
    expect(ten.mainDeck.filter((c) => c.invadeZones === 2)).toHaveLength(10);
    expect(rules(ten)).toEqual([]);
    // Swap one icon-1 card (ESD01-015) for a third ESD01-004 (icon 2): 11.
    const mainDeck = [...ten.mainDeck];
    mainDeck.splice(
      mainDeck.findIndex((c) => c.cardNumber === "ESD01-015"),
      1,
    );
    const eleven = { ...ten, mainDeck: [...mainDeck, card("ESD01-004")] };
    expect(eleven.mainDeck.filter((c) => c.invadeZones === 2)).toHaveLength(11);
    expect(rules(eleven)).toEqual(["6.1.1.2.2"]);
  });

  it("6.1.1.3 a Blue card with a Red rank I monster is invalid; a White card is valid (case 4)", () => {
    expect(rules(esd01With(card("ESD02-007")))).toEqual(["6.1.1.3"]);
    expect(
      validateDeck(esd01With(card("ESD02-007")), TODAY).failures[0]?.message,
    ).toContain("ESD02-007");
    expect(rules(esd01With(card("EBP01-077")))).toEqual([]); // Oxygen Destroyer: White, limited to 1
  });

  it("6.1.1.3 a multi-color card passes if any of its colors matches (Paul's ruling)", () => {
    expect(card("EBP03-006").colors).toEqual(["Red", "Blue"]);
    expect(rules(esd01With(card("EBP03-006")))).toEqual([]);
  });

  it("6.1.1.4.1 3 copies of X plus 2 of X+ count as 5 copies: invalid (case 5)", () => {
    const deck = starter("esd01-starter.txt");
    // The starter has 4 ESD01-012 (icon 2); make it 3 ESD01-012 and 2 ESD01-012+ (also icon 2),
    // dropping one ESD01-007 (icon 2) so the deck stays at 50 cards and 10 with icon 2.
    const x = card("ESD01-012");
    const plus = card("ESD01-012+");
    expect(plus.deckCardNumber).toBe("ESD01-012");
    const main = deck.mainDeck.filter((c) => c.cardNumber !== "ESD01-012");
    main.splice(
      main.findIndex((c) => c.cardNumber === "ESD01-007"),
      1,
    );
    const mainDeck = [...main, x, x, x, plus, plus];
    const result = validateDeck({ ...deck, mainDeck }, TODAY);
    expect(failedRules(result)).toEqual(["6.1.1.4"]);
    expect(result.failures[0]?.message).toBe(
      "5 copies of ESD01-012 (at most 4)",
    );
  });

  it("6.1.1.4 Q13: a card that allows any number of copies may have more than 4 (1.3.1)", () => {
    const deck = starter("esd01-starter.txt");
    const six = (c: Card) => [...deck.mainDeck.slice(6), c, c, c, c, c, c];
    // MBT-MB90 (EBP03-031, Red): "You may put any number of this card in your deck."
    expect(rules({ ...deck, mainDeck: six(card("EBP03-031")) })).toEqual([]);
    // Without that text the 4-copy limit holds.
    expect(rules({ ...deck, mainDeck: six(card("EBP01-001")) })).toContain(
      "6.1.1.4",
    );
  });

  it("6.1.1.5 a Token-trait card in the deck is invalid (case 6)", () => {
    expect(rules(esd01With(card("EBP02-T01")))).toEqual(["6.1.1.5"]);
  });

  it("Restriction list: Gravity Beam is invalid on 2026-09-01 and valid on 2026-08-31 (case 7)", () => {
    const deck = esd01With(card("EBP01-079"));
    expect(rules(deck, day("2026-09-01"))).toEqual(["Restriction list"]);
    expect(rules(deck, day("2026-08-31"))).toEqual([]);
  });

  it("Restriction list: two Oxygen Destroyer are invalid from 2026-04-01 (limited to 1)", () => {
    const deck = esd01With(card("EBP01-077"), card("EBP01-077"));
    expect(rules(deck, day("2026-03-31"))).toEqual([]);
    expect(rules(deck, day("2026-04-01"))).toEqual(["Restriction list"]);
  });

  it("Choice restriction: EBP02-003 and EBP03-035 together are invalid (case 8)", () => {
    const both = esd01With(card("EBP02-003"), card("EBP03-035"));
    expect(rules(both)).toEqual(["Choice restriction"]);
    expect(rules(esd01With(card("EBP02-003"), card("EBP02-003")))).toEqual([]);
    expect(rules(both, day("2026-03-31"))).toEqual([]);
  });

  it("6.1.1 every failed check is returned, not only the first", () => {
    const deck = esd01With(
      card("ESD02-007"),
      card("EBP02-T01"),
      card("EBP01-079"),
    );
    deck.monsterDeck = deck.monsterDeck.slice(0, 3);
    expect(rules(deck)).toEqual([
      "6.1.1.1",
      "6.1.1.3",
      "6.1.1.5",
      "Restriction list",
    ]);
  });
});
