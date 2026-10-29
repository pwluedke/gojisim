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

describe("plain reasons for the Illegal deck badges (M13b)", () => {
  const reasons = (deck: NamedDeck, asOf = TODAY) =>
    validateDeck(deck, asOf).failures.flatMap((f) => f.reasons);
  const named = (number: string) => `${card(number).name} (${number})`;

  it("Restriction list: a card restricted to 0 is banned since its list's date", () => {
    expect(reasons(esd01With(card("EBP01-079")))).toEqual([
      "Gravity Beam (EBP01-079): banned since Sep 1, 2026",
    ]);
  });

  it("Restriction list: copies over a limit name the count, the limit and the date", () => {
    expect(reasons(esd01With(card("EBP01-077"), card("EBP01-077")))).toEqual([
      `${named("EBP01-077")}: 2 copies, limit 1 since Apr 1, 2026`,
    ]);
  });

  it("Choice restriction: names the cards, only one may be played", () => {
    expect(reasons(esd01With(card("EBP02-003"), card("EBP03-035")))).toEqual([
      `Choice restriction: ${named("EBP02-003")} and ${named("EBP03-035")}, only one may be played`,
    ]);
  });

  it("6.1.1.3 colors: each off-color card, not white and not the rank I monster's color", () => {
    expect(reasons(esd01With(card("ESD02-007")))).toEqual([
      `${named("ESD02-007")} isn't white and doesn't include Red (the rank I monster's color)`,
    ]);
  });

  it("6.1.1.2, 6.1.1.1, 6.1.1.2.2, 6.1.1.4, 6.1.1.5: sizes, copies, invasion icon 2 and tokens with their counts", () => {
    const deck = starter("esd01-starter.txt");
    expect(reasons({ ...deck, mainDeck: deck.mainDeck.slice(0, 47) })).toEqual([
      "Main deck: 47 cards, needs exactly 50",
    ]);
    expect(
      reasons({ ...deck, monsterDeck: deck.monsterDeck.slice(0, 3) }),
    ).toEqual([
      "Monster deck: 3 cards, needs one monster card each of rank I to IV",
    ]);
    const mainDeck = [...deck.mainDeck];
    mainDeck.splice(
      mainDeck.findIndex((c) => c.cardNumber === "ESD01-015"),
      1,
    );
    expect(
      reasons({ ...deck, mainDeck: [...mainDeck, card("ESD01-004")] }),
    ).toEqual(["11 cards with invasion icon 2, limit 10"]);
    // The four ESD01-015 out; a fifth ESD01-013 and three cards that stay within 4 in.
    const five = [
      ...deck.mainDeck.filter((c) => c.cardNumber !== "ESD01-015"),
      ...["ESD01-013", "ESD01-002", "ESD01-003", "ESD01-016"].map(card),
    ];
    expect(reasons({ ...deck, mainDeck: five })).toEqual([
      `${named("ESD01-013")}: 5 copies, limit 4`,
    ]);
    expect(reasons(esd01With(card("EBP02-T01"), card("EBP02-T01")))).toEqual([
      `${named("EBP02-T01")}: 2 copies, Token cards can't be in a deck`,
    ]);
  });
});

describe("Resonance (K2, 6.1.2, 12.8.2)", () => {
  const resonance = (deck: NamedDeck) =>
    validateDeck(deck, TODAY)
      .failures.filter((f) => f.rule === "12.8.2")
      .map((f) => f.message);
  const deck = (monsters: string[], main: Card[]): NamedDeck => ({
    name: "Resonance",
    monsterDeck: monsters.map(card),
    mainDeck: main,
  });

  it("EBP03-006: a deck of [weapon] or [mech] monster and battle cards is legal", () => {
    const legal = deck(
      ["EBP03-006", "EBP03-007", "EBP03-008", "EBP03-009"],
      Array(50).fill(card("EBP03-031")),
    );
    expect(validateDeck(legal, TODAY).failures).toEqual([]);
  });

  it("EBP03-006: a battle card without [weapon] or [mech] breaks its condition", () => {
    const main = [
      ...Array(49).fill(card("EBP03-031")),
      card("EBP03-037"), // Godzilla (2001), a red battle card with neither trait
    ];
    expect(
      resonance(
        deck(["EBP03-006", "EBP03-007", "EBP03-008", "EBP03-009"], main),
      ),
    ).toEqual([
      "Resonance (EBP03-006): Battle cards in your deck must have [weapon] or [mech]: EBP03-037 Godzilla (2001)",
    ]);
  });

  it("EBP01-023 Mechagodzilla (1975) has [weapon] (both prints), so it meets EBP03-006's condition (12.8.2)", () => {
    // The site lists only Mechagodzilla; the printed card has Weapon too (overrides.json).
    const base = card("EBP01-023");
    const plus = card("EBP01-023+");
    expect(base.traits).toEqual(["Mechagodzilla", "Weapon"]);
    expect(plus.traits).toEqual(["Mechagodzilla", "Weapon"]);
    const legal = deck(
      ["EBP03-006", "EBP03-007", "EBP03-008", "EBP03-009"],
      [...Array(46).fill(card("EBP03-031")), base, base, plus, plus],
    );
    expect(resonance(legal)).toEqual([]);
    expect(validateDeck(legal, TODAY).failures).toEqual([]);
  });

  it("EBP03-018: at least 10 strategy cards; every monster card has [mothra]", () => {
    const monsters = ["EBP03-018", "EBP03-019", "EBP03-020", "EBP03-022"];
    const strategies = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        card(["EBP03-072", "EBP03-073", "EBP03-075"][i % 3] as string),
      );
    expect(resonance(deck(monsters, strategies(9)))).toEqual([
      "Resonance (EBP03-018): Your deck must contain at least 10 strategy cards (has 9)",
    ]);
    expect(resonance(deck(monsters, strategies(10)))).toEqual([]);
    // A main deck monster card without [mothra] breaks the other condition.
    expect(
      resonance(deck(monsters, [...strategies(10), card("EBP03-014")])),
    ).toEqual([
      "Resonance (EBP03-018): Monster cards in your deck must have [mothra]: EBP03-014 Godzilla (2002)",
    ]);
  });

  it("EBP03-024: battle cards must be rank 5 or higher", () => {
    const monsters = ["EBP03-024", "EBP03-025", "EBP03-026", "EBP03-028"];
    expect(
      resonance(deck(monsters, [card("EBP03-059"), card("EBP03-055")])),
    ).toEqual([
      "Resonance (EBP03-024): Battle cards in your deck must be rank 5 or higher: EBP03-055 Primitive Mothra",
    ]);
  });

  it("EBP04-031: battle cards must be [final-wars] only, in red, blue or green", () => {
    const monsters = ["EBP04-031", "EBP04-032", "EBP04-033", "EBP04-035"];
    expect(
      resonance(deck(monsters, [card("EBP04-037"), card("EBP04-047")])),
    ).toEqual([]);
    expect(
      resonance(deck(monsters, [card("EBP04-037"), card("EBP04-043")])),
    ).toEqual([
      "Resonance (EBP04-031): Battle cards must be [final-wars] only: EBP04-043 Multi-purpose Fighting System-3",
    ]);
  });

  it("6.1.1.3, 12.8.2: Resonance's colors are allowed; others still aren't", () => {
    const monsters = ["EBP03-024", "EBP03-025", "EBP03-026", "EBP03-028"];
    const colors = validateDeck(
      deck(monsters, [card("EBP03-059"), card("EBP03-033"), card("EBP03-046")]),
      TODAY,
    ).failures.filter((f) => f.rule === "6.1.1.3");
    // Green and red pass; Land Moguera (blue) doesn't.
    expect(colors.map((f) => f.message)).toEqual([
      "Cards must be White or Green/Red like the rank I monster: EBP03-046 Land Moguera",
    ]);
    expect(failedRules(validateDeck(deck(monsters, []), TODAY))).not.toContain(
      "12.8.2",
    );
  });
});
