import { getAllCards } from "@gojisim/cards/all-cards";
import { describe, expect, it } from "vitest";
import type { SavedDeck } from "../game/deckStore";
import {
  archetypesWithCard,
  combosWithCard,
  copiesLabel,
  decksWithCard,
} from "./insightLookups";

// #166 card insights: My decks, archetypes (#191's catalog) and combos that use a card.

const saved = (id: string, name: string, main: string[]): SavedDeck => ({
  id,
  name,
  list: [`[deck] ${name}`, "[main deck]", ...main].join("\n"),
  savedAt: "2026-11-04T00:00:00.000Z",
});

describe("card insights lookups (#166)", () => {
  it("decksWithCard: My decks holding the card, most copies first, with folder and short name", () => {
    const decks = [
      saved("a", "Community/Red Rage", ["2 ESD01-013", "1 ESD01-014"]),
      saved("b", "Heat", ["4 ESD01-013"]),
      saved("c", "Other", ["4 ESD01-014"]),
    ];
    expect(
      decksWithCard(decks, "ESD01-013").map((d) => [
        d.id,
        d.name,
        d.folder,
        d.copies,
      ]),
    ).toEqual([
      ["b", "Heat", null, 4],
      ["a", "Red Rage", "Community", 2],
    ]);
  });

  it("decksWithCard: a deck whose list no longer parses is left out", () => {
    expect(
      decksWithCard([saved("x", "Broken", ["4 NOPE-999"])], "NOPE-999"),
    ).toEqual([]);
  });

  it("archetypesWithCard: rank I, core and common lines of the catalog, with their counts", () => {
    expect(archetypesWithCard("EBP03-014")).toContainEqual({
      archetype: "Tangler",
      role: "Rank I",
      count: null,
    });
    expect(archetypesWithCard("EBP04-081")).toContainEqual({
      archetype: "Tangler",
      role: "Core",
      count: [4, 4],
    });
    const roles = archetypesWithCard("EBP04-081").map((a) => a.role);
    expect(roles).toEqual(
      [...roles].sort(
        (a, b) =>
          ["Rank I", "Core", "Common"].indexOf(a) -
          ["Rank I", "Core", "Common"].indexOf(b),
      ),
    );
    // A card no archetype names gives nothing.
    const unnamed = getAllCards().find(
      (c) =>
        c.parentId === null &&
        archetypesWithCard(c.deckCardNumber).length === 0,
    );
    expect(unnamed).toBeDefined();
  });

  it("combosWithCard: the combos naming the card, with their steps", () => {
    const combos = combosWithCard("ESD01-013");
    expect(combos.map((c) => c.name)).toContain("Ginza Inferno");
    expect(combos[0]?.steps).toMatch(/Ginza Annihilated/);
    expect(combosWithCard("EBP03-014")).toEqual([]);
  });

  it("copiesLabel: a fixed count or a range", () => {
    expect(copiesLabel([4, 4])).toBe("×4");
    expect(copiesLabel([2, 3])).toBe("×2–3");
  });
});
