import { describe, expect, it } from "vitest";
import { getAllCards } from "../src/allCards";
import { findCardByNumber, parseDeckList } from "../src/deckLists";
import { allCardsLegalFrom, getNotYetLegal } from "../src/releaseDates";
import { type Deck, validateDeck } from "../src/validate";

/**
 * SD05-005 Constructed Future (仕組まれた未来), hand-entered from the Japanese starter SD05 (Nov 6,
 * 2026) with Paul's translation, under the community's name; tournament-legal from Dec 4, 2026, when ESD05 is out.
 */

const card = (n: string) => {
  const found = findCardByNumber(n);
  if (!found) throw new Error(`no ${n}`);
  return found;
};
const failuresOf = (deck: Deck, asOf: string, rule: string) =>
  validateDeck(deck, new Date(asOf)).failures.filter((f) => f.rule === rule);

describe("SD05-005 Constructed Future", () => {
  it("is a White rank 6 strategy card with invasion icon 2, with its SP print SD05-005+", () => {
    const base = card("SD05-005");
    expect(base).toMatchObject({
      name: "Constructed Future",
      type: "Strategy",
      colors: ["White"],
      rank: 6,
      invadeZones: 2,
      isParallel: false,
    });
    expect(base.notes).toContain("仕組まれた未来");
    expect(base.notes).toContain(
      "official English name TBA (ESD05, Dec 4, 2026)",
    );
    const sp = card("SD05-005+");
    expect(sp).toMatchObject({
      isParallel: true,
      parentId: base.id,
      deckCardNumber: "SD05-005",
      rarity: "SP",
    });
    expect(
      getAllCards()
        .filter((c) => c.deckCardNumber === "SD05-005")
        .map((c) => c.cardNumber),
    ).toEqual(["SD05-005", "SD05-005+"]);
  });

  it("6.1.1.4.1: both prints resolve in a deck list and count as one card", () => {
    const { decks, errors } = parseDeckList(
      ["[deck] Constructed", "[main deck]", "3 SD05-005", "2 SD05-005+"].join(
        "\n",
      ),
    );
    expect(errors).toEqual([]);
    const deck = decks[0] as Deck;
    expect(deck.mainDeck.map((c) => c.deckCardNumber)).toEqual(
      Array(5).fill("SD05-005"),
    );
    expect(failuresOf(deck, "2026-12-04", "6.1.1.4")).toHaveLength(1);
  });

  it("6.1.1.2.2: counts toward the 10 invasion icon 2 cards", () => {
    const icon2 = getAllCards().find(
      (c) => c.invadeZones === 2 && c.type === "Battle" && c.parentId === null,
    );
    if (!icon2) throw new Error("no icon 2 battle card");
    const ten: Deck = {
      monsterDeck: [],
      mainDeck: [
        ...Array(10).fill(icon2),
        ...Array(40).fill(card("ESD01-016")),
      ],
    };
    expect(failuresOf(ten, "2026-12-04", "6.1.1.2.2")).toEqual([]);
    const eleven: Deck = {
      monsterDeck: [],
      mainDeck: [...ten.mainDeck.slice(0, 49), card("SD05-005")],
    };
    expect(eleven.mainDeck.filter((c) => c.invadeZones === 2)).toHaveLength(11);
    expect(failuresOf(eleven, "2026-12-04", "6.1.1.2.2")).toHaveLength(1);
  });

  it("isn't tournament-legal before Dec 4, 2026, and is from that day", () => {
    const deck: Deck = { monsterDeck: [], mainDeck: [card("SD05-005+")] };
    const before = failuresOf(deck, "2026-12-03", "Release date");
    expect(before).toHaveLength(1);
    expect(before[0]?.reasons).toEqual([
      "Constructed Future (SD05-005): tournament-legal from Dec 4, 2026",
    ]);
    expect(failuresOf(deck, "2026-12-04", "Release date")).toEqual([]);
    expect(getNotYetLegal("SD05-005", new Date("2026-11-04"))).toBe(
      "2026-12-04",
    );
    expect(getNotYetLegal("ESD01-016", new Date("2026-11-04"))).toBeNull();
  });

  it("tools check legality on the day every card is out: Dec 4, 2026 until then, today after", () => {
    expect(
      allCardsLegalFrom(new Date("2026-11-04T12:00:00Z")).toISOString(),
    ).toBe("2026-12-04T00:00:00.000Z");
    const later = new Date("2027-01-10T00:00:00Z");
    expect(allCardsLegalFrom(later)).toBe(later);
  });
});
