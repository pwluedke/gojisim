import { getAllCards } from "@gojisim/cards/test-decks";
import { describe, expect, it } from "vitest";
import {
  applyFilter,
  buildPool,
  facets,
  filterFromQuery,
  filterToQuery,
  NO_FILTER,
  setOf,
} from "./cardPool";

const pool = buildPool(getAllCards());
const byNumber = (n: string) => pool.find((e) => e.deckCardNumber === n);

describe("the Deckbuilder's card pool (#157)", () => {
  it("one entry per deck card number: English monster, battle and strategy prints only, the base print first", () => {
    expect(pool.length).toBeGreaterThan(300);
    expect(new Set(pool.map((e) => e.deckCardNumber)).size).toBe(pool.length);
    for (const e of pool) {
      expect(["Monster", "Battle", "Strategy"]).toContain(e.card.type);
      expect(
        e.prints.every((p) => p.unknownFields["Language"] === undefined),
      ).toBe(true);
      expect(e.prints.every((p) => p.deckCardNumber === e.deckCardNumber)).toBe(
        true,
      );
      expect(e.card.traits.includes("Token")).toBe(false);
    }
    // A card with parallel prints offers them as the art choice.
    const withArt = pool.find((e) => e.prints.length > 1);
    expect(withArt?.prints[0]?.parentId).toBeNull();
    expect(withArt?.prints.slice(1).every((p) => p.parentId !== null)).toBe(
      true,
    );
  });

  it("no filter shows everything; search reads name, text and traits; words combine", () => {
    expect(applyFilter(pool, NO_FILTER)).toHaveLength(pool.length);
    const destoroyah = applyFilter(pool, { ...NO_FILTER, q: "destoroyah" });
    expect(destoroyah.length).toBeGreaterThan(0);
    expect(destoroyah.every((e) => e.search.includes("destoroyah"))).toBe(true);
    const both = applyFilter(pool, { ...NO_FILTER, q: "destoroyah perfect" });
    expect(both.length).toBeLessThanOrEqual(destoroyah.length);
    expect(both.every((e) => e.search.includes("perfect"))).toBe(true);
  });

  it("set, color, type, rank range, trait and keyword each narrow, and they combine", () => {
    const set = applyFilter(pool, { ...NO_FILTER, sets: ["ESD01"] });
    expect(set.length).toBeGreaterThan(0);
    expect(set.every((e) => setOf(e) === "ESD01")).toBe(true);
    const red = applyFilter(pool, { ...NO_FILTER, colors: ["Red"] });
    expect(red.every((e) => e.card.colors.includes("Red"))).toBe(true);
    const monsters = applyFilter(pool, { ...NO_FILTER, types: ["Monster"] });
    expect(monsters.every((e) => e.card.type === "Monster")).toBe(true);
    const ranks = applyFilter(pool, { ...NO_FILTER, rankMin: 2, rankMax: 3 });
    expect(
      ranks.every(
        (e) => e.card.rank !== null && e.card.rank >= 2 && e.card.rank <= 3,
      ),
    ).toBe(true);
    const godzilla = applyFilter(pool, { ...NO_FILTER, trait: "godzilla" });
    expect(godzilla.length).toBeGreaterThan(0);
    const burst = applyFilter(pool, { ...NO_FILTER, keyword: "burst" });
    expect(burst.length).toBeGreaterThan(0);
    expect(burst.every((e) => e.keywords.includes("burst"))).toBe(true);
    const all = applyFilter(pool, {
      ...NO_FILTER,
      sets: ["ESD01"],
      types: ["Monster"],
      colors: ["Red"],
    });
    expect(
      all.every(
        (e) =>
          setOf(e) === "ESD01" &&
          e.card.type === "Monster" &&
          e.card.colors.includes("Red"),
      ),
    ).toBe(true);
    expect(all.length).toBeLessThan(set.length);
  });

  it("the facets list each filter's values", () => {
    const f = facets(pool);
    expect(f.sets).toEqual(expect.arrayContaining(["ESD01", "ESD02", "EBP01"]));
    expect(f.colors).toContain("Red");
    expect(f.keywords).toEqual(expect.arrayContaining(["burst", "evolution"]));
    expect(f.traits).toContain("Godzilla");
  });

  it("the filter round-trips through the URL; bad values are dropped", () => {
    const f = {
      ...NO_FILTER,
      q: "heat ray",
      sets: ["ESD01", "EBP02"],
      colors: ["Red"],
      types: ["Battle" as const],
      rankMin: 2,
      rankMax: 6,
      trait: "Godzilla",
      keyword: "burst",
    };
    expect(filterFromQuery(filterToQuery(f))).toEqual(f);
    expect(filterToQuery(NO_FILTER)).toBe("");
    expect(filterFromQuery("type=Rage,Monster&rankMin=x&rankMax=99")).toEqual({
      ...NO_FILTER,
      types: ["Monster"],
    });
  });

  it("searches the card text, not just names", () => {
    const entry = pool.find(
      (e) =>
        /counter phase/i.test(e.search) && !/counter phase/i.test(e.card.name),
    );
    expect(entry).toBeDefined();
    expect(
      applyFilter(pool, { ...NO_FILTER, q: "counter phase" }).some(
        (e) => e.deckCardNumber === entry?.deckCardNumber,
      ),
    ).toBe(true);
    expect(pool.some((e) => e.search.includes("[object object]"))).toBe(false);
  });

  it("finds a known card by number", () => {
    expect(byNumber("ESD01-001")?.card.name).toBeTruthy();
  });
});
