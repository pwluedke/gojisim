import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abilityCoverage } from "../src/coverage";
import { inScopeCards } from "../src/survey";

interface SurveyJson {
  cards: Record<string, { abilities: unknown[] }>;
}

const survey = JSON.parse(
  readFileSync(
    new URL("../../../docs/abilities/survey.json", import.meta.url),
    "utf8",
  ),
) as SurveyJson;

describe("ability survey (M4a)", () => {
  it("survey.json covers every in-scope card, none missing (Rage cards excluded, 3.4.2.1; Tokens listed apart, 9.1)", () => {
    const expected = inScopeCards()
      .map((c) => String(c.id))
      .sort();
    expect(Object.keys(survey.cards).sort()).toEqual(expected);
    for (const id of expected)
      expect(Array.isArray(survey.cards[id]?.abilities)).toBe(true);
  });
});

describe("ability coverage (format.md M4 build plan item 5)", () => {
  it("all 31 starter cards are implemented, and every in-scope card has a status", () => {
    const coverage = abilityCoverage();
    expect(coverage.starters).toEqual({
      implemented: 31,
      partial: 0,
      manual: 0,
    });
    expect(coverage.rows).toHaveLength(inScopeCards().length);
    const total = coverage.total;
    expect(total.implemented + total.partial + total.manual).toBe(
      coverage.rows.length,
    );
    expect(
      coverage.rows
        .filter((r) => r.deckRules.includes("anyNumber"))
        .map((r) => r.deckCardNumber),
    ).toEqual(["EBP01-046", "EBP02-031", "EBP03-031", "EBP04-059"]);
  });
});
