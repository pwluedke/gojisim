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
import { importStatus } from "./importDeck";

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
      expect(tcgdb.format).toBe("godzillatcgdb");
      expect(tcgdb.deck?.name).toBe("Little King Trash Mouth");
      expect(tcgdb.errors).toEqual([]);
    }
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
    expect(status.canSave("Little King Trash Mouth")).toBe(true);
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
});
