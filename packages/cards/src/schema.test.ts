import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Card,
  CardOverridesSchema,
  CardSchema,
  stripPrintMarkers,
} from "./schema";

const dataDir = new URL("../data/", import.meta.url);
const cards = JSON.parse(
  readFileSync(new URL("cards.json", dataDir), "utf8"),
) as unknown[];
const summary = JSON.parse(
  readFileSync(new URL("summary.json", dataDir), "utf8"),
) as {
  total: number;
  perSet: Record<string, number>;
};

describe("cards.json", () => {
  it("has entries", () => {
    expect(cards.length).toBeGreaterThan(0);
  });

  it("validates every entry against CardSchema", () => {
    const errors = cards.flatMap((card, index) => {
      const result = CardSchema.safeParse(card);
      return result.success ? [] : [{ index, issues: result.error.issues }];
    });
    expect(errors).toEqual([]);
  });

  it("is sorted by cardNumber with unique ids", () => {
    const parsed = cards as Card[];
    const numbers = parsed.map((c) => c.cardNumber);
    expect(numbers).toEqual([...numbers].sort());
    expect(new Set(parsed.map((c) => c.id)).size).toBe(parsed.length);
  });

  it("matches the per-set counts in summary.json", () => {
    const perSet: Record<string, number> = {};
    for (const card of cards as Card[]) {
      perSet[card.set] = (perSet[card.set] ?? 0) + 1;
    }
    console.log("Cards per set:", perSet);
    expect(summary.perSet).toEqual(perSet);
    expect(summary.total).toBe(cards.length);
  });
});

describe("print linking", () => {
  const parsed = cards as Card[];
  const byId = new Map(parsed.map((c) => [c.id, c]));
  const overrides = CardOverridesSchema.parse(
    JSON.parse(readFileSync(new URL("overrides.json", dataDir), "utf8")),
  );

  it("points every parentId at an existing print, without cycles", () => {
    for (const card of parsed) {
      const seen = new Set<number>();
      let current: Card | undefined = card;
      while (current && current.parentId !== null) {
        expect(seen.has(current.id), `cycle at ${card.id}`).toBe(false);
        seen.add(current.id);
        current = byId.get(current.parentId);
        expect(current, `parent of ${card.id}`).toBeDefined();
      }
    }
  });

  // Rule 6.1.1.4: the 4-copy limit counts every print of a card together.
  it("gives every print with a parentId its parent's deckCardNumber (rule 6.1.1.4)", () => {
    const mismatches = parsed
      .filter((c) => c.parentId !== null)
      .filter(
        (c) =>
          byId.get(c.parentId as number)?.deckCardNumber !== c.deckCardNumber,
      )
      .map((c) => c.id);
    expect(mismatches).toEqual([]);
  });

  it("has no parallel without a parent (overrides included)", () => {
    expect(
      parsed
        .filter((c) => c.isParallel && c.parentId === null)
        .map((c) => c.id),
    ).toEqual([]);
  });

  it("applies every field in overrides.json", () => {
    for (const [id, { reason: _reason, ...fields }] of Object.entries(
      overrides,
    )) {
      expect(byId.get(Number(id))).toMatchObject(fields);
    }
  });

  it("links EPR-005+ (id 443) to Godzilla's Bite EPR-005 (id 896)", () => {
    expect(byId.get(443)).toMatchObject({
      cardNumber: "EPR-005+",
      parentId: 896,
      deckCardNumber: "EPR-005",
      imageUrl: "https://image.godzillatcgdb.com/img/cards/original/PR/443.png",
    });
    expect(byId.get(896)).toMatchObject({
      cardNumber: "EPR-005",
      parentId: null,
    });
  });
});

describe("stripPrintMarkers", () => {
  it.each([
    ["EBP01-030", "EBP01-030"],
    ["EBP01-030+", "EBP01-030"],
    ["EBP01-030++", "EBP01-030"],
    ["ESD01-002 (Foil)", "ESD01-002"],
    ["EBP01-017+ (Alt)", "EBP01-017"],
  ])("%s -> %s", (input, expected) => {
    expect(stripPrintMarkers(input)).toBe(expected);
  });
});
