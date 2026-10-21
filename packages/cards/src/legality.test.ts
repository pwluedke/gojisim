import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERRATA, getCardText } from "./errata";
import {
  DEFAULT_MAX_COPIES,
  getChoiceRestrictions,
  getMaxCopies,
  RESTRICTION_LISTS,
} from "./restrictions";
import type { Card } from "./schema";

const cards = JSON.parse(
  readFileSync(new URL("../data/cards.json", import.meta.url), "utf8"),
) as Card[];
const deckCardNumbers = new Set(cards.map((c) => c.deckCardNumber));
const printsOf = (deckCardNumber: string) =>
  cards.filter((c) => c.deckCardNumber === deckCardNumber);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const GRAVITY_BEAM = "EBP01-079";
const OXYGEN_DESTROYER = "EBP01-077";
const GODZILLA_2003 = "EBP03-016";
const DESPAIR = "EBP02-018";

describe("errata.json and restrictions.json", () => {
  it("only reference deckCardNumbers that exist in cards.json", () => {
    const referenced = [
      ...ERRATA.map((e) => e.deckCardNumber),
      ...RESTRICTION_LISTS.flatMap((l) => [
        ...l.entries.map((e) => e.deckCardNumber),
        ...l.choiceRestrictions.flatMap((g) => g.deckCardNumbers),
      ]),
    ];
    expect(referenced.filter((n) => !deckCardNumbers.has(n))).toEqual([]);
  });

  it("can apply every erratum to every print of its card", () => {
    for (const erratum of ERRATA) {
      for (const card of printsOf(erratum.deckCardNumber)) {
        expect(() => getCardText(card), card.cardNumber).not.toThrow();
      }
    }
  });
});

describe("getCardText", () => {
  it("reports errata on both prints of Despair (EBP02-018, EBP02-018+)", () => {
    const prints = printsOf(DESPAIR);
    expect(prints.map((c) => c.cardNumber).sort()).toEqual([
      "EBP02-018",
      "EBP02-018+",
    ]);
    for (const card of prints) {
      const result = getCardText(card);
      expect(result.hasErrata).toBe(true);
      expect(result.text).toContain(
        "that is occupying a zone at or before the zone your monster card currently occupies.",
      );
      expect(result.text).toContain("zone 1, 2, 3, or 4.)");
      expect(result.printedText).toContain(
        "that occupies a zone before the zone your monster card currently occupies.",
      );
      expect(result.printedText).toContain("zone 1, 2, or 3.)");
    }
  });

  // Pending: en.godzilla-cardgame.com/errata/759/ was down for maintenance (HTTP 503) and has no
  // Internet Archive copy. Add the Rodan(2004) erratum to errata.json from that page, then make
  // this a real test like the Despair one above.
  it.todo("reports errata on both prints of Rodan(2004) (EBP02-015, EBP02-015+)");

  it("returns the scraped text unchanged for a card without errata", () => {
    const [card] = printsOf(GRAVITY_BEAM);
    expect(getCardText(card as Card)).toEqual({
      text: card?.text,
      hasErrata: false,
    });
  });

  it("applies the correction when the source text is the printed wording", () => {
    const [despair] = printsOf(DESPAIR);
    const printed = getCardText(despair as Card).printedText as string;
    const result = getCardText({ deckCardNumber: DESPAIR, text: printed });
    expect(result).toEqual({
      text: (despair as Card).text,
      hasErrata: true,
      printedText: printed,
    });
  });
});

// Rule 6.1.1.4: at most 4 copies of a card with the same card number, unless restricted.
describe("getMaxCopies (rule 6.1.1.4)", () => {
  it("restricts Gravity Beam to 0 from 2026-09-01, and allows 4 the day before", () => {
    expect(getMaxCopies(GRAVITY_BEAM, day("2026-09-01"))).toBe(0);
    expect(getMaxCopies(GRAVITY_BEAM, day("2026-08-31"))).toBe(
      DEFAULT_MAX_COPIES,
    );
  });

  it("restricts Godzilla(2003) to 0 from 2026-09-01", () => {
    expect(getMaxCopies(GODZILLA_2003, day("2026-09-01"))).toBe(0);
  });

  it("limits Oxygen Destroyer to 1 from 2026-04-01, still in force after the Sep 1 list", () => {
    expect(getMaxCopies(OXYGEN_DESTROYER, day("2026-03-31"))).toBe(4);
    expect(getMaxCopies(OXYGEN_DESTROYER, day("2026-04-01"))).toBe(1);
    expect(getMaxCopies(OXYGEN_DESTROYER, day("2026-10-21"))).toBe(1);
  });

  it("returns 4 for an unrestricted card", () => {
    expect(getMaxCopies("EBP01-001", day("2026-10-21"))).toBe(4);
  });
});

describe("getChoiceRestrictions", () => {
  it("groups Godzilla(2016) 2nd Form and Satsuma from 2026-04-01", () => {
    expect(getChoiceRestrictions(day("2026-03-31"))).toEqual([]);
    expect(getChoiceRestrictions(day("2026-04-01"))).toEqual([
      { deckCardNumbers: ["EBP02-003", "EBP03-035"] },
    ]);
    expect(getChoiceRestrictions(day("2026-10-21"))).toHaveLength(1);
  });
});
