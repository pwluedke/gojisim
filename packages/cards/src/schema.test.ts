import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Card, CardSchema } from "./schema";

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
