import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ABILITY_FILES,
  AbilityFileSchema,
  CardAbilitiesSchema,
  getCardAbilities,
  loadAbilities,
} from "../src";
import { getAllCards } from "../src/allCards";

const DIR = new URL("../data/abilities/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

describe("ability data (format.md)", () => {
  it("every abilities/<SET>.json file is registered and valid", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(Object.keys(ABILITY_FILES).sort()).toEqual(
      files.map((f) => f.replace(/\.json$/, "")).sort(),
    );
    for (const file of files) {
      const raw: unknown = JSON.parse(readFileSync(new URL(file, DIR), "utf8"));
      const result = AbilityFileSchema.safeParse(raw);
      expect(result.error?.message, file).toBeUndefined();
    }
    expect(() => loadAbilities()).not.toThrow();
  });

  it("every entry names a base card of its own set", () => {
    const bySet = new Map<string, Set<string>>();
    for (const card of getAllCards()) {
      const numbers = bySet.get(card.set) ?? new Set<string>();
      numbers.add(card.deckCardNumber);
      bySet.set(card.set, numbers);
    }
    for (const [set, raw] of Object.entries(ABILITY_FILES)) {
      for (const number of Object.keys(raw as object))
        expect(bySet.get(set)?.has(number), `${set}: ${number}`).toBe(true);
    }
  });

  it("a card with no entry counts as manual, with no abilities", () => {
    expect(getCardAbilities("EBP01-001")).toEqual({
      deckCardNumber: "EBP01-001",
      status: "manual",
      abilities: [],
    });
    expect(getCardAbilities("ESD01-003").status).toBe("implemented");
  });

  it("the schema rejects unknown fields, unknown effects and duplicate ability ids", () => {
    const base = { deckCardNumber: "X-1", status: "implemented" };
    const draw = { effect: "draw", player: "you", count: 1 };
    const triggered = (id: string, effects: unknown[]) => ({
      kind: "triggered",
      id,
      trigger: { on: "enter" },
      effects,
    });
    expect(
      CardAbilitiesSchema.safeParse({
        ...base,
        abilities: [triggered("a", [draw])],
      }).success,
    ).toBe(true);
    expect(
      CardAbilitiesSchema.safeParse({
        ...base,
        abilities: [triggered("a", [{ ...draw, extra: 1 }])],
      }).success,
    ).toBe(false);
    expect(
      CardAbilitiesSchema.safeParse({
        ...base,
        abilities: [triggered("a", [{ effect: "teleport" }])],
      }).success,
    ).toBe(false);
    expect(
      CardAbilitiesSchema.safeParse({
        ...base,
        abilities: [triggered("a", [draw]), triggered("a", [draw])],
      }).success,
    ).toBe(false);
  });

  it("the schema accepts the M12 rows (nested search, chooseOne, keywords, deck rules)", () => {
    const result = CardAbilitiesSchema.safeParse({
      deckCardNumber: "X-2",
      status: "partial",
      deckRules: [{ rule: "anyNumber" }],
      abilities: [
        {
          kind: "keyword",
          keyword: { name: "evolution", rank: 5, trait: "Mothra" },
        },
        {
          kind: "triggered",
          id: "t",
          trigger: { on: "invading" },
          cost: {
            optional: true,
            effects: [
              {
                effect: "discard",
                player: "you",
                count: { exact: 1 },
                chooser: "you",
                as: "paid",
              },
            ],
          },
          effects: [
            {
              effect: "search",
              player: "you",
              filter: { owner: "you", area: "deck", type: "Battle" },
              count: { upTo: 1 },
              effects: [
                {
                  effect: "addToHand",
                  target: { owner: "you", area: "bound", bind: "found" },
                },
              ],
            },
            {
              effect: "chooseOne",
              options: [
                [{ effect: "mill", player: "you", count: 3 }],
                [{ effect: "setRage", player: "opponent", value: 0 }],
              ],
            },
          ],
        },
        {
          kind: "replacement",
          id: "r",
          replaces: {
            event: "destroyed",
            what: { owner: "you", area: "zones", this: true },
          },
          instead: [
            {
              effect: "putOnDeck",
              target: { owner: "you", area: "zones", this: true },
              where: "bottom",
            },
          ],
        },
      ],
    });
    expect(result.error?.message).toBeUndefined();
  });
});
