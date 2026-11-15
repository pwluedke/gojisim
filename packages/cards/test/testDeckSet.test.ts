import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDeckList } from "../src/deckLists";
import {
  MAX_TEST_DECKS,
  testDeckSetFromFile,
  testDecksOf,
  validateTestDeckSet,
} from "../src/testDeckSet";

/**
 * #359: the test deck set, on made-up decks: the public starter lists under sample names (the
 * real test decks live on the server only, never in the repo).
 */
const starter = (file: string) =>
  readFileSync(new URL(`../data/decks/${file}`, import.meta.url), "utf8");
const esd01 = starter("esd01-starter.txt");
const esd02 = starter("esd02-starter.txt");
const named = (text: string, name: string) =>
  text.replace(/^\[deck\].*$/m, `[deck] ${name}`);

describe("#359 test deck set", () => {
  it("a set of two sample decks is valid, and reads back as decks under the set's names", () => {
    const set = {
      decks: [
        { name: "Sample A", list: esd01 },
        { name: "Sample B", list: esd02 },
      ],
    };
    expect(validateTestDeckSet(set)).toEqual([]);
    const decks = testDecksOf(set);
    expect(decks.map((d) => d.name)).toEqual(["Sample A", "Sample B"]);
    const starterDeck = parseDeckList(esd01).decks[0]!;
    expect(decks[0]!.mainDeck.map((c) => c.id)).toEqual(
      starterDeck.mainDeck.map((c) => c.id),
    );
    expect(decks[0]!.monsterDeck).toHaveLength(starterDeck.monsterDeck.length);
  });

  it("an empty set is valid (every deck removed by an upload)", () => {
    expect(validateTestDeckSet({ decks: [] })).toEqual([]);
  });

  it("finds a bad shape, a field it doesn't know, bad names and lists that don't read", () => {
    expect(validateTestDeckSet([])).toEqual(["not an object"]);
    expect(validateTestDeckSet({ decks: {} })).toEqual(["decks is not a list"]);
    expect(validateTestDeckSet({ decks: [], code: "x" })).toEqual([
      "unexpected field code",
    ]);
    const problems = validateTestDeckSet({
      decks: [
        { name: "Sample A", list: esd01, owner: "x" },
        { name: "sample a", list: esd02 },
        { name: "", list: esd01 },
        { name: " Padded", list: esd01 },
        { name: "x".repeat(61), list: esd01 },
        { name: "Tab\there", list: esd01 },
        { name: "No list" },
        { name: "Bad card", list: "[deck] x\n[main deck]\n4 NOPE01-999" },
        { name: "Two", list: `${esd01}\n${esd02}` },
        { name: "Empty", list: "[deck] Empty" },
      ],
    });
    expect(problems).toEqual([
      "decks[0]: unexpected field owner",
      "decks[1]: name sample a twice",
      "decks[2]: no name",
      "decks[3]: name has spaces at an end",
      "decks[4]: name over 60 characters",
      "decks[5]: name has a control character",
      "decks[6]: no list",
      "decks[7]: line 3: Unknown card number NOPE01-999",
      "decks[8]: 2 decks in the list",
      "decks[9]: no cards",
    ]);
  });

  it(`refuses more than ${MAX_TEST_DECKS} decks`, () => {
    const decks = Array.from({ length: MAX_TEST_DECKS + 1 }, (_, i) => ({
      name: `Sample ${i}`,
      list: esd01,
    }));
    expect(validateTestDeckSet({ decks })).toContain(
      `more than ${MAX_TEST_DECKS} decks`,
    );
  });

  it("reads the script's input as GojiSim text, each deck named by its [deck] line", () => {
    const set = testDeckSetFromFile(
      `${named(esd01, "Sample A")}\n\n${named(esd02, "Sample B")}`,
    );
    expect(validateTestDeckSet(set)).toEqual([]);
    expect(set.decks.map((d) => d.name)).toEqual(["Sample A", "Sample B"]);
    expect(set.decks[0]!.list.startsWith("[deck] Sample A\n")).toBe(true);
  });

  it("reads the script's input as JSON (name → deck list), storing each as GojiSim text", () => {
    const set = testDeckSetFromFile(
      JSON.stringify({ "Sample A": esd01, "Sample B": esd02 }),
    );
    expect(validateTestDeckSet(set)).toEqual([]);
    expect(set.decks.map((d) => d.name)).toEqual(["Sample A", "Sample B"]);
    expect(set.decks[1]!.list.startsWith("[deck] Sample B\n")).toBe(true);
    // A list that doesn't read is kept as given, so the check names its line.
    const bad = testDeckSetFromFile(
      JSON.stringify({ Bad: "[deck] x\n[main deck]\n4 NOPE01-999" }),
    );
    expect(validateTestDeckSet(bad)).toEqual([
      "decks[0]: line 3: Unknown card number NOPE01-999",
    ]);
  });

  it("refuses script input that reads as neither", () => {
    expect(() => testDeckSetFromFile("hello")).toThrow(/line 1/);
    expect(() => testDeckSetFromFile('{"A": 3}')).toThrow(/not text/);
  });
});
