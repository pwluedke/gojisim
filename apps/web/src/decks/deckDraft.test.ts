import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { findCardByNumber, parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import { describe, expect, it } from "vitest";
import {
  addCard,
  copyName,
  type DeckDraft,
  draftOf,
  draftText,
  emptyDraft,
  legality,
  removeCard,
  rows,
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

  it("6.1.1.2: the main deck needs exactly 50 cards", () => {
    const d = starter();
    const l = legality({ ...d, mainDeck: d.mainDeck.slice(1) }, ASOF);
    expect(l.legal).toBe(false);
    expect(l.reasons.find((r) => r.rule === "6.1.1.2")?.text).toBe(
      "Main deck: 49 cards, needs exactly 50",
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
