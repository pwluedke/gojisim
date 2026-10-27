import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findCardByNumber,
  formatDeckList,
  type NamedDeck,
  parseAnyDeckList,
  parseDeckList,
} from "../src/deckLists";

const sample = readFileSync(
  new URL("fixtures/sample-decks.txt", import.meta.url),
  "utf8",
);
const shape = (decks: NamedDeck[]) =>
  decks.map((d) => ({
    name: d.name,
    monster: d.monsterDeck.map((c) => c.id),
    main: d.mainDeck.map((c) => c.id),
  }));

describe("parseDeckList", () => {
  it("Engine: reads named decks with both sections, skipping comments and blank lines", () => {
    const { decks } = parseDeckList(sample);
    expect(decks.map((d) => d.name)).toEqual([
      "Test Folder/Red Sample",
      "Broken Sample",
    ]);
    const [red] = decks;
    expect(red?.monsterDeck.map((c) => c.cardNumber)).toEqual([
      "ESD01-001",
      "ESD01-002",
      "ESD01-003",
      "ESD01-004",
    ]);
    expect(red?.mainDeck).toHaveLength(10);
    // A "+" card number resolves to that parallel print.
    expect(red?.mainDeck.find((c) => c.isParallel)?.cardNumber).toBe(
      "ESD01-012+",
    );
  });

  it("Engine: reports each bad line with its line number and reason, and keeps the rest of the deck", () => {
    const { decks, errors } = parseDeckList(sample);
    expect(errors.map((e) => [e.line, e.reason])).toEqual([
      [18, "Unknown card number NOPE-999"],
      [20, 'Count "0" is not a positive integer'],
      [21, 'Count "x2" is not a positive integer'],
      [22, "Unknown header [side deck]"],
      [24, 'Expected a count and a card number, e.g. "2 EBP02-027"'],
    ]);
    const broken = decks[1];
    expect(broken?.monsterDeck.map((c) => c.cardNumber)).toEqual(["ESD02-001"]);
    // The unknown header ends nothing: later cards still go to the last valid section.
    expect(broken?.mainDeck.map((c) => c.cardNumber)).toEqual([
      "ESD02-009",
      "ESD02-009",
      "ESD02-009",
      "ESD02-010",
      "ESD02-010",
      "ESD02-010",
      "ESD02-010",
    ]);
  });

  it("Engine: a card before any section header is an error", () => {
    const { decks, errors } = parseDeckList("[deck] X\n2 ESD01-005\n");
    expect(errors).toEqual([
      {
        line: 2,
        reason: "Card listed before a [monster deck] or [main deck] header",
        text: "2 ESD01-005",
        deck: 0,
      },
    ]);
    expect(decks[0]?.mainDeck).toEqual([]);
  });

  it("each error names the deck its line belongs to; a line before any deck names none", () => {
    const { errors } = parseDeckList(
      "2 ESD01-005\n[deck] A\n[main deck]\n1 ZZZ99-999\n\n[deck] B\n[main deck]\n1 ZZZ99-998\n",
    );
    expect(errors.map((e) => [e.line, e.deck])).toEqual([
      [1, undefined],
      [4, 0],
      [8, 1],
    ]);
  });

  it("Engine: card numbers prefer the base print when several prints share one", () => {
    // EBP01-001+ is both the EBP01 parallel and its PR reprint.
    const card = findCardByNumber("EBP01-001+");
    expect(card).toMatchObject({ set: "EBP01", parentId: 113 });
    expect(findCardByNumber("ESD01-001")?.parentId).toBeNull();
  });

  it("Engine: formatDeckList output parses back to the same decks (round trip)", () => {
    const { decks } = parseDeckList(sample);
    const text = formatDeckList(decks);
    const again = parseDeckList(text);
    expect(again.errors).toEqual([]);
    expect(shape(again.decks)).toEqual(shape(decks));
    expect(formatDeckList(again.decks)).toBe(text);
  });

  it("Engine: both official starter lists parse without errors", () => {
    for (const file of ["esd01-starter.txt", "esd02-starter.txt"]) {
      const { decks, errors } = parseDeckList(
        readFileSync(new URL(`../data/decks/${file}`, import.meta.url), "utf8"),
      );
      expect(errors).toEqual([]);
      expect(decks).toHaveLength(1);
      expect(decks[0]?.monsterDeck).toHaveLength(4);
      expect(decks[0]?.mainDeck).toHaveLength(50);
    }
  });
});

describe("pasted deck list formats (M7a)", () => {
  const fixture = (name: string) =>
    readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

  it("GojiSim text: detected and parsed as before", () => {
    const parsed = parseAnyDeckList(sample);
    expect(parsed.format).toBe("gojisim");
    expect(shape(parsed.decks)).toEqual(shape(parseDeckList(sample).decks));
  });

  for (const [shapeName, file] of [
    ["one cell per line", "godzillatcgdb-print-lines.txt"],
    ["tab-separated rows", "godzillatcgdb-print-tabs.txt"],
  ] as const)
    it(`godzillatcgdb.com printable deck list, ${shapeName}: name, monster deck and main deck`, () => {
      const parsed = parseAnyDeckList(fixture(file));
      expect(parsed.format).toBe("godzillatcgdb-print");
      expect(parsed.errors).toEqual([]);
      const [deck] = parsed.decks;
      expect(deck?.name).toBe("Sample Gigan Deck");
      expect(deck?.monsterDeck.map((c) => c.cardNumber)).toEqual([
        "EBP04-027",
        "EBP02-042",
        "EBP04-029",
        "EBP02-044",
      ]);
      expect(deck?.mainDeck).toHaveLength(47);
      // 3 copies of Destroy All Monsters, from its "EBP01 076 3" row.
      expect(
        deck?.mainDeck.filter((c) => c.cardNumber === "EBP01-076"),
      ).toHaveLength(3);
    });

  it("godzillatcgdb rows separated by spaces (another browser's copy)", () => {
    const text = [
      "Deck: Spaced",
      "Monster Deck",
      "Godzilla (2023) [I] ESD01 001 1",
      "Monster Cards (2)",
      "Godzilla (2023) ESD01 002 2",
    ].join("\n");
    const { decks, errors } = parseAnyDeckList(text);
    expect(errors).toEqual([]);
    expect(decks[0]?.name).toBe("Spaced");
    expect(decks[0]?.monsterDeck.map((c) => c.cardNumber)).toEqual([
      "ESD01-001",
    ]);
    expect(decks[0]?.mainDeck.map((c) => c.cardNumber)).toEqual([
      "ESD01-002",
      "ESD01-002",
    ]);
  });

  it("an unknown card number is an error with its line, in either format", () => {
    const tcgdb = parseAnyDeckList(
      "Deck: Bad\nMonster Deck\nNope\tZZZ99\t999\t1\n",
    );
    expect(tcgdb.errors).toEqual([
      expect.objectContaining({
        line: 3,
        reason: "Unknown card number ZZZ99-999",
      }),
    ]);
    const ours = parseAnyDeckList("[deck] Bad\n[main deck]\n1 ZZZ99-999\n");
    expect(ours.errors[0]?.reason).toBe("Unknown card number ZZZ99-999");
  });

  it("text in no known format is one error; empty text is none", () => {
    expect(parseAnyDeckList("hello world").errors).toHaveLength(1);
    expect(parseAnyDeckList("hello world").format).toBeNull();
    expect(parseAnyDeckList("   ").errors).toEqual([]);
  });
});

describe("godzilla-sim exports and the godzillatcgdb deck page (M7a review)", () => {
  const fixture = (name: string) =>
    readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
  const count = (cards: { cardNumber: string }[], number: string) =>
    cards.filter((c) => c.cardNumber === number).length;

  it("godzilla-sim Export to Clipboard (one deck, no [deck] line) reads as GojiSim text", () => {
    const parsed = parseAnyDeckList(fixture("godzilla-sim-export-one.txt"));
    expect(parsed.format).toBe("gojisim");
    expect(parsed.errors).toEqual([]);
    expect(parsed.decks).toHaveLength(1);
    expect(parsed.decks[0]?.monsterDeck).toHaveLength(4);
    expect(parsed.decks[0]?.mainDeck).toHaveLength(50);
  });

  it("godzilla-sim Export All Decks reads as GojiSim text: every deck, folders kept in names", () => {
    const parsed = parseAnyDeckList(fixture("godzilla-sim-export-all.txt"));
    expect(parsed.format).toBe("gojisim");
    expect(parsed.errors).toEqual([]);
    expect(parsed.decks.map((d) => d.name)).toEqual([
      "Starters/Starter Deck - Godzilla Minus One",
      "Starters/Starter Deck - Heisei Series Godzilla",
    ]);
    for (const deck of parsed.decks) expect(deck.mainDeck).toHaveLength(50);
  });

  it("a godzillatcgdb deck page copied whole: counts from the badges, the rest of the page ignored", () => {
    const parsed = parseAnyDeckList(fixture("godzillatcgdb-deck-page.txt"));
    expect(parsed.format).toBe("godzillatcgdb-page");
    expect(parsed.errors).toEqual([]);
    const [deck] = parsed.decks;
    expect(deck?.name).toBe("Sample Gigan Deck");
    // Monster deck: bare numbers, one copy each.
    expect(deck?.monsterDeck.map((c) => c.cardNumber)).toEqual([
      "EBP04-027",
      "EBP02-042",
      "EBP04-029",
      "EBP02-044",
    ]);
    // Main deck: 19 + 20 + 11 cards, each count from the badge line before its number.
    expect(deck?.mainDeck).toHaveLength(50);
    expect(count(deck?.mainDeck ?? [], "EBP04-028")).toBe(4);
    expect(count(deck?.mainDeck ?? [], "EBP02-042")).toBe(3);
    expect(count(deck?.mainDeck ?? [], "EBP01-077")).toBe(1);
  });

  it("deck page: a badge on the card's own line counts too; a card with no badge is an error", () => {
    const sameLine = parseAnyDeckList(
      "My Page Deck\nAuthor: someone\nMonster Deck\nESD01-001\nMonster Cards (2)\n2 ESD01-002\n",
    );
    expect(sameLine.format).toBe("godzillatcgdb-page");
    expect(sameLine.errors).toEqual([]);
    expect(sameLine.decks[0]?.name).toBe("My Page Deck");
    expect(sameLine.decks[0]?.mainDeck.map((c) => c.cardNumber)).toEqual([
      "ESD01-002",
      "ESD01-002",
    ]);
    const missing = parseAnyDeckList(
      "Deck\nAuthor: x\nMonster Deck\nESD01-001\nBattle Cards (1)\nESD01-008\n",
    );
    expect(missing.errors).toEqual([
      expect.objectContaining({
        line: 6,
        reason: "No count badge for ESD01-008",
      }),
    ]);
  });

  it("the print page and the deck page are told apart", () => {
    expect(
      parseAnyDeckList(fixture("godzillatcgdb-print-tabs.txt")).format,
    ).toBe("godzillatcgdb-print");
    expect(
      parseAnyDeckList(fixture("godzillatcgdb-deck-page.txt")).format,
    ).toBe("godzillatcgdb-page");
  });
});
