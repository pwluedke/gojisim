import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decklogCardNumber,
  decklogCode,
  type DecklogDeck,
  decklogDeckList,
} from "../src/decklog";
import { parseDeckList } from "../src/deckLists";
import { validateDeck } from "../src/validate";

/** Decklog's recorded answer for deck 1STAP (public title and list). */
const raw = JSON.parse(
  readFileSync(new URL("fixtures/decklog-1STAP.json", import.meta.url), "utf8"),
) as DecklogDeck & { deck_id: string };
const deck: DecklogDeck = {
  code: raw.deck_id,
  title: raw.title,
  list: raw.list,
  p_list: raw.p_list,
  sub_list: raw.sub_list,
};

describe("decklogCode", () => {
  it("reads a deck URL or a bare code", () => {
    expect(decklogCode("https://decklog-en.bushiroad.com/view/1STAP")).toBe(
      "1STAP",
    );
    expect(decklogCode(" decklog-en.bushiroad.com/view/2545R/ ")).toBe("2545R");
    expect(
      decklogCode("https://decklog-en.bushiroad.com/ja/view/1STAP?x=1"),
    ).toBe("1STAP");
    expect(decklogCode("1STAP")).toBe("1STAP");
  });

  it("rejects other sites and text that can't be a code", () => {
    expect(decklogCode("https://example.com/view/1STAP")).toBeNull();
    expect(decklogCode("../etc")).toBeNull();
    expect(decklogCode("")).toBeNull();
  });
});

describe("decklogDeckList", () => {
  it("Decklog deck 2545R (with the hand-entered EPR-020) reads as 4 + 50 and is legal", () => {
    const deck2545 = JSON.parse(
      readFileSync(
        new URL("fixtures/decklog-2545R.json", import.meta.url),
        "utf8",
      ),
    ) as DecklogDeck & { deck_id: string };
    const list = decklogDeckList({ ...deck2545, code: deck2545.deck_id });
    expect(list.unknown).toEqual([]);
    const { decks, errors } = parseDeckList(list.text);
    expect(errors).toEqual([]);
    const [read] = decks;
    expect(read?.monsterDeck).toHaveLength(4);
    expect(read?.mainDeck).toHaveLength(50);
    expect(
      [...read!.monsterDeck, ...read!.mainDeck].filter(
        (c) => c.cardNumber === "EPR-020",
      ),
    ).toHaveLength(1);
    expect(validateDeck(read!, new Date("2026-10-24")).failures).toEqual([]);
  });

  it("6.1.1.1, 6.1.1.2: deck 1STAP reads as 4 monster cards and 50 main deck cards, named after its title", () => {
    const list = decklogDeckList(deck);
    expect(list.unknown).toEqual([]);
    expect(list.fallbacks).toEqual([]);
    expect(list.ignored).toBe(0);
    const { decks, errors } = parseDeckList(list.text);
    expect(errors).toEqual([]);
    const [read] = decks;
    expect(read?.name).toBe("The Despangler");
    expect(read?.monsterDeck).toHaveLength(4);
    expect(read?.mainDeck).toHaveLength(50);
    expect(validateDeck(read!, new Date("2026-10-24")).failures).toEqual([]);
  });

  it("6.1.1.4.1: parallels (+) and PR reprints (++) keep their print and count as the base card number", () => {
    const { decks } = parseDeckList(decklogDeckList(deck).text);
    const main = decks[0]!.mainDeck;
    const landing = main.filter((c) => c.cardNumber === "EBP01-030++");
    expect(landing).toHaveLength(4);
    expect(landing[0]?.deckCardNumber).toBe("EBP01-030");
    expect(
      main.find((c) => c.cardNumber === "EBP01-002+")?.deckCardNumber,
    ).toBe("EBP01-002");
  });

  it("a + print missing from the card data reads as its base card; EPR-005+ keeps its override", () => {
    expect(decklogCardNumber("ESD01-008+")).toBe("ESD01-008");
    expect(decklogCardNumber("EPR-005+")).toBe("EPR-005+");
    const list = decklogDeckList({
      ...deck,
      p_list: deck.p_list,
      list: [{ card_number: "ESD01-008+", num: 2 }],
    });
    expect(list.fallbacks).toEqual([["ESD01-008+", "ESD01-008"]]);
    expect(list.text).toContain("\n2 ESD01-008\n");
  });

  it("unknown card numbers are listed and left in the text, where the parser reports their lines", () => {
    const list = decklogDeckList({
      ...deck,
      list: [...deck.list, { card_number: "ZZZ99-999", num: 1 }],
      sub_list: [{ card_number: "EBP01-002+", num: 2 }],
    });
    expect(list.unknown).toEqual(["ZZZ99-999"]);
    expect(list.ignored).toBe(2);
    expect(parseDeckList(list.text).errors.map((e) => e.reason)).toEqual([
      "Unknown card number ZZZ99-999",
    ]);
  });

  it("a deck with no title is named after its code; a title is one line", () => {
    expect(decklogDeckList({ ...deck, title: "" }).text).toMatch(
      /^\[deck\] Decklog 1STAP\n/,
    );
    expect(decklogDeckList({ ...deck, title: "A\r\nB " }).text).toMatch(
      /^\[deck\] A B\n/,
    );
  });
});
