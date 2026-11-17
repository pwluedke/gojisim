import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatDeckList, parseDeckList } from "./deckLists";
import type { Card } from "./schema";
import { validateDeck } from "./validate";

const cards = JSON.parse(
  readFileSync(new URL("../data/cards.json", import.meta.url), "utf8"),
) as Card[];
const byId = (id: number) => cards.find((c) => c.id === id)!;
const byNumber = (n: string) => cards.find((c) => c.cardNumber === n)!;

describe("deck lists (#437: every print is its base card)", () => {
  it("a deck with a finish print (the SSP Godzilla (2004), EBP01-008+ (Foil)) in the monster deck saves and reads back, its monster deck and copies legal", () => {
    const starter = parseDeckList(
      readFileSync(
        new URL("../data/decks/esd01-starter.txt", import.meta.url),
        "utf8",
      ),
    ).decks[0]!;
    const ssp = byId(682);
    expect(ssp.cardNumber).toBe("EBP01-008+ (Foil)");
    expect(ssp.deckCardNumber).toBe("EBP01-008");
    // Keldroc's Despangler: the SSP in the monster deck, the SP copies in the main deck.
    const monsterDeck = [
      byNumber("EBP01-001"),
      byNumber("ESD01-002"),
      ssp,
      byNumber("EBP01-010"),
    ];
    const mainDeck = [
      ...Array.from({ length: 3 }, () => byNumber("EBP01-008+")),
      ...starter.mainDeck.slice(3),
    ];
    const text = formatDeckList([
      { name: "Despangler", monsterDeck, mainDeck },
    ]);
    expect(text).toContain("1 EBP01-008+ (Foil)");
    const back = parseDeckList(text);
    expect(back.errors).toEqual([]);
    const deck = back.decks[0]!;
    expect(deck.monsterDeck.map((c) => c.id)).toEqual(
      monsterDeck.map((c) => c.id),
    );
    expect(deck.mainDeck).toHaveLength(50);
    const legality = validateDeck(deck, new Date("2026-11-17T00:00:00Z"));
    // The monster deck (6.1.1.1) and the copy limit (6.1.1.4, the SSP and SPs as one card) pass.
    // (This made-up main deck breaks the icon 2 limit, 6.1.1.2.2, which isn't #437's.)
    const rules = legality.failures.map((f) => f.rule);
    expect(rules.filter((r) => r.startsWith("6.1.1.1"))).toEqual([]);
    expect(rules.filter((r) => r.startsWith("6.1.1.4"))).toEqual([]);
  });

  it("an unknown suffix is still an error", () => {
    const r = parseDeckList(
      "[deck] X\n[monster deck]\n1 EBP01-008+ (Shiny)\n[main deck]\n",
    );
    expect(r.errors).toHaveLength(1);
  });
});
