import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  backupJson,
  deckOf,
  deckStore,
  readBackup,
  savedDeck,
} from "./deckStore";
import { deckName, freeName, importAll, importStatus } from "./importDeck";

const cardsFixture = (name: string) =>
  readFileSync(
    new URL(
      `../../../../packages/cards/test/fixtures/${name}`,
      import.meta.url,
    ),
    "utf8",
  );
const starter = readFileSync(
  new URL(
    "../../../../packages/cards/data/decks/esd01-starter.txt",
    import.meta.url,
  ),
  "utf8",
);

describe("deck import (M7a)", () => {
  it("each supported format parses into a deck that can be saved", () => {
    const ours = importStatus(starter);
    expect(ours.format).toBe("gojisim");
    expect(ours.deck?.monsterDeck).toHaveLength(4);
    expect(ours.deck?.mainDeck).toHaveLength(50);
    expect(ours.warnings).toEqual([]);
    expect(ours.canSave("Red")).toBe(true);
    for (const file of [
      "godzillatcgdb-print-lines.txt",
      "godzillatcgdb-print-tabs.txt",
    ]) {
      const tcgdb = importStatus(cardsFixture(file));
      expect(tcgdb.format).toBe("godzillatcgdb-print");
      expect(tcgdb.deck?.name).toBe("Sample Gigan Deck");
      expect(tcgdb.errors).toEqual([]);
    }
  });

  it("godzilla-sim exports and a godzillatcgdb deck page parse; an unnamed export suggests no name", () => {
    const one = importStatus(cardsFixture("godzilla-sim-export-one.txt"));
    expect(one.format).toBe("gojisim");
    expect(one.deck?.mainDeck).toHaveLength(50);
    // Export to Clipboard writes no name line: the player names the deck.
    expect(one.suggestedName).toBe("");
    expect(one.canSave("")).toBe(false);
    expect(one.canSave("Red")).toBe(true);
    const all = importStatus(cardsFixture("godzilla-sim-export-all.txt"));
    expect(all.decks).toHaveLength(2);
    // My decks gets the name after the folder.
    expect(all.suggestedName).toBe("Starter Deck - Godzilla Minus One");
    const page = importStatus(cardsFixture("godzillatcgdb-deck-page.txt"));
    expect(page.format).toBe("godzillatcgdb-page");
    expect(page.suggestedName).toBe("Sample Gigan Deck");
    expect(page.warnings).toEqual([]);
    expect(page.canSave(page.suggestedName)).toBe(true);
  });

  it("an unknown card number is an error and blocks saving", () => {
    const status = importStatus(`${starter}4 ZZZ99-999\n`);
    expect(status.errors.map((e) => e.reason)).toEqual([
      "Unknown card number ZZZ99-999",
    ]);
    expect(status.deck).toBeDefined();
    expect(status.canSave("Anything")).toBe(false);
  });

  it("an illegal deck saves, with warnings (Paul's ruling: illegal decks play)", () => {
    // godzillatcgdb marks this deck invalid: 47 main deck cards (6.1.1.2 wants 50).
    const status = importStatus(cardsFixture("godzillatcgdb-print-tabs.txt"));
    expect(status.warnings.length).toBeGreaterThan(0);
    expect(status.warnings.map((w) => w.rule)).toContain("6.1.1.2");
    expect(status.canSave("Sample Gigan Deck")).toBe(true);
    expect(status.canSave("   ")).toBe(false);
  });

  it("the backup round-trips: names, cards and order", () => {
    const decks = [
      savedDeck(importStatus(starter).deck!, "Red", new Date(1)),
      savedDeck(
        importStatus(cardsFixture("godzillatcgdb-print-lines.txt")).deck!,
        "Gigan",
        new Date(2),
      ),
    ];
    const { decks: back, problems } = readBackup(backupJson(decks));
    expect(problems).toEqual([]);
    expect(back.map((d) => d.name)).toEqual(["Red", "Gigan"]);
    const cards = (list: typeof decks) =>
      list.map((d) => {
        const deck = deckOf(d)!;
        return [
          deck.monsterDeck.map((c) => c.id),
          deck.mainDeck.map((c) => c.id),
        ];
      });
    expect(cards(back)).toEqual(cards(decks));
    expect(readBackup("not json").problems).toHaveLength(1);
    expect(readBackup('{"app":"other"}').problems).toEqual([
      "Not a GojiSim deck backup",
    ]);
  });

  it("decks save to IndexedDB and load back; without storage, saving reports false", async () => {
    const idb = new IDBFactory();
    const deck = savedDeck(importStatus(starter).deck!, "Red");
    expect(await deckStore(idb).put(deck)).toBe(true);
    expect((await deckStore(idb).list()).map((d) => d.name)).toEqual(["Red"]);
    expect(await deckStore(idb).remove(deck.id)).toBe(true);
    expect(await deckStore(idb).list()).toEqual([]);
    const none = deckStore(undefined);
    expect(await none.put(deck)).toBe(false);
    await expect(none.list()).rejects.toThrow();
  });

  it("a deck's name for My decks is the [deck] name after its last slash", () => {
    expect(deckName("Community/Red Rage")).toBe("Red Rage");
    expect(deckName("Paul/Tests/Blue Hoard ")).toBe("Blue Hoard");
    // No slash: unchanged.
    expect(deckName("Red Rage")).toBe("Red Rage");
    // Nothing after the slash: the whole name stays.
    expect(deckName("Community/")).toBe("Community/");
  });

  it("a taken name gets (2), (3) and so on", () => {
    expect(freeName("Red", new Set())).toBe("Red");
    expect(freeName("Red", new Set(["Red"]))).toBe("Red (2)");
    expect(freeName("Red", new Set(["Red", "Red (2)"]))).toBe("Red (3)");
  });

  it("Import all saves every deck that parses and reports the one that doesn't", () => {
    const body = starter.replace(/^\[deck\].*\n/, "");
    const text = [
      `[deck] Community/Red Rage\n${body}`,
      `[deck] Community/Broken\n${body}4 ZZZ99-999\n`,
      `[deck] Paul/Red Rage\n${body}`,
    ].join("\n");
    expect(importStatus(text).decks).toHaveLength(3);
    const result = importAll(text, ["Red Rage"]);
    // Both good decks are named after the folder; one name in My decks already, and the
    // second "Red Rage" of the import takes the next free number.
    expect(result.saved.map((d) => d.name)).toEqual([
      "Red Rage (2)",
      "Red Rage (3)",
    ]);
    expect(result.saved[0]?.deck.mainDeck).toHaveLength(50);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.name).toBe("Community/Broken");
    expect(result.failed[0]?.reasons).toEqual([
      expect.stringMatching(/^Line \d+: Unknown card number ZZZ99-999$/),
    ]);
    expect(result.stray).toEqual([]);
  });
});
