import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
