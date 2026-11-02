import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { findCardByNumber, parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import { describe, expect, it } from "vitest";
import {
  addCard,
  copiesOf,
  copyName,
  type DeckDraft,
  deckCounts,
  draftOf,
  draftText,
  emptyDraft,
  fillTo,
  legality,
  rankColumns,
  removeCard,
  removeCopy,
  rows,
  slotOrder,
  zoneFor,
} from "./deckDraft";

const ASOF = new Date("2026-11-01T12:00:00Z");
const starter = (): DeckDraft => {
  const text = readFileSync(
    new URL(
      "../../../../packages/cards/data/decks/esd01-starter.txt",
      import.meta.url,
    ),
    "utf8",
  );
  return draftOf(parseDeckList(text).decks[0] as Parameters<typeof draftOf>[0]);
};
const card = (n: string) => {
  const c = findCardByNumber(n);
  if (!c) throw new Error(n);
  return c;
};
const rules = (d: DeckDraft) => legality(d, ASOF).reasons.map((r) => r.rule);
/** The starter with its last main deck card swapped for `c`. */
const swap = (d: DeckDraft, c: Card): DeckDraft => ({
  ...d,
  mainDeck: [...d.mainDeck.slice(0, -1), c],
});

describe("building a deck (#158)", () => {
  it("a click puts a monster in the monster deck while its rank is free, otherwise the main deck; other cards go to the main deck", () => {
    const one = getAllCards().find(
      (c) => c.type === "Monster" && c.rank === 1 && c.parentId === null,
    ) as Card;
    let d = emptyDraft();
    expect(zoneFor(d, one)).toBe("monster");
    d = addCard(d, one);
    expect(d.monsterDeck).toHaveLength(1);
    expect(zoneFor(d, one)).toBe("main");
    const battle = card("ESD01-016");
    expect(zoneFor(d, battle)).toBe("main");
  });

  it("rows group a zone by print with counts; removing takes one copy of that print", () => {
    const heat = card("ESD01-016");
    let d = addCard(addCard(emptyDraft(), heat), heat);
    expect(rows(d.mainDeck)).toEqual([{ card: heat, count: 2 }]);
    d = removeCard(d, "main", heat.cardNumber);
    expect(rows(d.mainDeck)).toEqual([{ card: heat, count: 1 }]);
    expect(removeCard(d, "main", "NOPE-000")).toBe(d);
  });

  it("keeps the chosen print: a parallel's number goes in the deck list", () => {
    const parallel = getAllCards().find(
      (c) =>
        c.parentId !== null &&
        c.unknownFields["Language"] === undefined &&
        c.type === "Battle",
    ) as Card;
    const text = draftText(addCard(emptyDraft("Art"), parallel));
    expect(text).toContain(parallel.cardNumber);
    expect(parseDeckList(text).decks[0]?.mainDeck[0]?.cardNumber).toBe(
      parallel.cardNumber,
    );
  });

  it("copies are named '<name> (copy)', then '(copy 2)'", () => {
    expect(copyName("Red", ["Red"])).toBe("Red (copy)");
    expect(copyName("Red", ["Red", "Red (copy)"])).toBe("Red (copy 2)");
  });
});

describe("live legality, as validateDeck reports it (#158)", () => {
  it("the starter is legal", () => {
    expect(legality(starter(), ASOF)).toMatchObject({
      legal: true,
      reasons: [],
    });
  });

  it("6.1.1.1: the monster deck needs one monster card each of rank I to IV", () => {
    const d = starter();
    expect(rules({ ...d, monsterDeck: d.monsterDeck.slice(1) })).toContain(
      "6.1.1.1",
    );
  });

  it("6.1.1.2: the main deck needs exactly 50 cards; #165: a short one reads as its empty slots", () => {
    const d = starter();
    const short = legality({ ...d, mainDeck: d.mainDeck.slice(1) }, ASOF);
    expect(short.legal).toBe(false);
    expect(short.reasons.find((r) => r.rule === "6.1.1.2")?.text).toBe(
      "1 main deck slot is empty",
    );
    const empty = legality({ ...d, mainDeck: [] }, ASOF);
    expect(empty.reasons.find((r) => r.rule === "6.1.1.2")?.text).toBe(
      "50 main deck slots are empty",
    );
    // Too many keeps the rule's own words.
    const long = legality(
      { ...d, mainDeck: [...d.mainDeck, d.mainDeck[0] as Card] },
      ASOF,
    );
    expect(long.reasons.find((r) => r.rule === "6.1.1.2")?.text).toBe(
      "Main deck: 51 cards, needs exactly 50",
    );
  });

  it("6.1.1.4: at most 4 copies of a card, and the card is marked", () => {
    const d = starter();
    const four = rows(d.mainDeck).find((r) => r.count === 4)?.card as Card;
    // A fifth copy in place of another card: still 50 cards.
    const other = d.mainDeck.findIndex(
      (c) => c.deckCardNumber !== four.deckCardNumber,
    );
    const l = legality(
      { ...d, mainDeck: d.mainDeck.map((c, i) => (i === other ? four : c)) },
      ASOF,
    );
    expect(l.reasons.map((r) => r.rule)).toContain("6.1.1.4");
    expect(l.marked.has(four.deckCardNumber)).toBe(true);
  });

  it("6.1.1.3: every card shares a color with the rank I monster or is White", () => {
    const d = starter();
    const off = getAllCards().find(
      (c) =>
        c.type === "Battle" &&
        c.parentId === null &&
        !c.colors.includes("White") &&
        !c.colors.some((x) => d.monsterDeck[0]?.colors.includes(x)),
    ) as Card;
    const l = legality(swap(d, off), ASOF);
    expect(l.reasons.map((r) => r.rule)).toContain("6.1.1.3");
    expect(l.marked.has(off.deckCardNumber)).toBe(true);
  });

  it("6.1.1.2.2: at most 10 main deck cards with invasion icon 2", () => {
    const d = starter();
    const icon2 = getAllCards().filter(
      (c) =>
        c.invadeZones === 2 &&
        c.parentId === null &&
        c.type === "Battle" &&
        c.colors.some((x) => d.monsterDeck[0]?.colors.includes(x)),
    );
    const eleven = Array.from(
      { length: 11 },
      (_, i) => icon2[i % icon2.length] as Card,
    );
    expect(
      rules({ ...d, mainDeck: [...d.mainDeck.slice(0, 39), ...eleven] }),
    ).toContain("6.1.1.2.2");
  });

  it("6.1.1.5: no Token cards", () => {
    const token = getAllCards().find(
      (c) => c.traits.includes("Token") && c.parentId === null,
    ) as Card;
    expect(rules(swap(starter(), token))).toContain("6.1.1.5");
  });

  it("the restriction list on today's date: a banned card", () => {
    const l = legality(swap(starter(), card("EBP01-079")), ASOF);
    expect(l.reasons.map((r) => r.rule)).toContain("Restriction list");
    expect(l.marked.has("EBP01-079")).toBe(true);
  });

  it("a choice restriction: two cards that can't be in one deck", () => {
    const d = starter();
    const both = {
      ...d,
      mainDeck: [
        ...d.mainDeck.slice(0, 48),
        card("EBP02-003"),
        card("EBP03-035"),
      ],
    };
    expect(rules(both)).toContain("Choice restriction");
  });

  it("Resonance: a rank I monster with Resonance adds its own conditions", () => {
    const resonance = card("EBP03-006");
    const d = starter();
    const withIt = {
      ...d,
      monsterDeck: [
        resonance,
        ...d.monsterDeck.filter((c) => c.rank !== resonance.rank),
      ],
    };
    const l = legality(withIt, ASOF);
    // The starter's monsters don't meet EBP03-006's condition (Weapon or Mech monsters).
    expect(l.legal).toBe(false);
    expect(
      l.reasons.some(
        (r) =>
          /resonance/i.test(r.rule) ||
          /resonance/i.test(r.text) ||
          r.rule.startsWith("6.1.2") ||
          r.rule.startsWith("12.8"),
      ),
    ).toBe(true);
  });
});

describe("#165 deck panel helpers", () => {
  it("6.1.1.4: copies count every print of a card in both decks", () => {
    const d = starter();
    const monster = d.monsterDeck[0] as Card;
    const withMain = addCard(d, monster, "main");
    expect(copiesOf(withMain, monster.deckCardNumber)).toBe(2);
  });

  it("− takes a copy from the main deck first, then the monster deck", () => {
    const d = starter();
    const monster = d.monsterDeck[0] as Card;
    const both = addCard(d, monster, "main");
    const once = removeCopy(both, monster.deckCardNumber);
    expect(once.mainDeck).toHaveLength(50);
    expect(once.monsterDeck).toHaveLength(4);
    const twice = removeCopy(once, monster.deckCardNumber);
    expect(twice.monsterDeck).toHaveLength(3);
    // Nothing left to take: unchanged.
    expect(removeCopy(twice, monster.deckCardNumber)).toBe(twice);
  });

  it("Add 4 fills to the limit and never past it (6.1.1.4)", () => {
    const battle = card("ESD01-016");
    const d = addCard(emptyDraft(), battle);
    const filled = fillTo(d, battle, 4);
    expect(copiesOf(filled, battle.deckCardNumber)).toBe(4);
    expect(fillTo(filled, battle, 4)).toBe(filled);
    // A restricted card fills to its own limit.
    expect(
      copiesOf(fillTo(emptyDraft(), battle, 1), battle.deckCardNumber),
    ).toBe(1);
  });

  it("Slots sort by rank, then name; Rank columns put each copy under ranks 1 to 8", () => {
    const d = starter();
    const slots = slotOrder(d.mainDeck);
    expect(slots).toHaveLength(50);
    const ranks = slots.map((c) => c.rank ?? 99);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    const columns = rankColumns(d.mainDeck);
    expect(columns).toHaveLength(8);
    expect(columns.flat()).toHaveLength(50);
    columns.forEach((col, i) =>
      col.forEach((c) => expect(Math.min(c.rank ?? 1, 8)).toBe(i + 1)),
    );
  });

  it("the counts line: Battle, Strategy and each color in the main deck", () => {
    const counts = deckCounts(starter());
    expect(counts.battle + counts.strategy).toBeLessThanOrEqual(50);
    expect(counts.colors[0]?.[0]).toBe("Red");
    expect(counts.colors.reduce((n, [, k]) => n + k, 0)).toBeGreaterThanOrEqual(
      50,
    );
  });
});
