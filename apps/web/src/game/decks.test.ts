import { formatDeckList, parseDeckList } from "@gojisim/cards/deck-lists";
import { describe, expect, it } from "vitest";
import type { NamedDeck } from "@gojisim/cards/deck-lists";
import {
  type DeckOption,
  deckOptions,
  pickerGroups,
  importsToMove,
  playDeckOptions,
  optionLegality,
  tournamentProblems,
  randomDeckKey,
} from "./decks";
import { newSession } from "./session";

const official = (key: string) => {
  const option = deckOptions([]).find((o) => o.key === key);
  if (!option) throw new Error(`no ${key}`);
  return option;
};

/** The ESD01 starter with 3 main deck cards left out: 47 cards (6.1.1.2). */
const short: DeckOption = {
  key: "mine:short",
  label: "Short",
  kind: "mine",
  build: (seed) => {
    const deck = official("official:ESD01").build(seed);
    return { ...deck, name: "Short", mainDeck: deck.mainDeck.slice(3) };
  },
};

describe("deck legality by match mode", () => {
  it("a legal deck has no Tournament problems", () => {
    expect(
      tournamentProblems(optionLegality(official("official:ESD01"), 1)),
    ).toEqual([]);
  });

  it("6.1.1.2: a 47-card main deck can't be picked in a Tournament game, and says why", () => {
    expect(tournamentProblems(optionLegality(short, 1))).toEqual([
      "6.1.1.2: Main deck needs exactly 50 cards (has 47)",
    ]);
  });

  it("6.1.1.4: too many copies is a Tournament problem", () => {
    const deck = official("official:ESD01").build(1);
    const first = deck.mainDeck[0] as NamedDeck["mainDeck"][number];
    const copies: DeckOption = {
      ...short,
      build: () => ({
        ...deck,
        mainDeck: [...deck.mainDeck.slice(5), ...Array(5).fill(first)],
      }),
    };
    expect(tournamentProblems(optionLegality(copies, 1)).join("\n")).toMatch(
      /^6\.1\.1\.4: /m,
    );
  });

  it("a deck that can't be built is a problem, not a crash", () => {
    const broken: DeckOption = {
      ...short,
      build: () => {
        throw new Error("gone");
      },
    };
    expect(tournamentProblems(optionLegality(broken, 1))).toEqual([
      "Error: gone",
    ]);
  });

  it("the record stores each deck's legality at game start (spec Setup step 1)", () => {
    const session = newSession(
      1,
      [short, official("official:ESD02")],
      { P1: { kind: "human" }, P2: { kind: "human" } },
      { mode: "casual" },
    );
    expect(session.record.mode).toBe("casual");
    expect(
      session.record.deckLegality?.map((d) => [
        d.player,
        d.legal,
        d.failedRules,
      ]),
    ).toEqual([
      ["P1", false, ["6.1.1.2"]],
      ["P2", true, []],
    ]);
  });
});

describe("Randomize", () => {
  it("picks another deck from the candidates, by the random source given", () => {
    const keys = ["a", "b", "c", "d"];
    // With "b" current, the pool is a, c, d.
    expect(randomDeckKey(keys, "b", () => 0)).toBe("a");
    expect(randomDeckKey(keys, "b", () => 0.5)).toBe("c");
    expect(randomDeckKey(keys, "b", () => 0.999)).toBe("d");
  });

  it("keeps the only candidate, and has nothing to pick from an empty list", () => {
    expect(randomDeckKey(["a"], "a", () => 0.7)).toBe("a");
    expect(randomDeckKey([], "a")).toBeNull();
  });

  it("uses a fresh random source by default, not a seed: many picks reach every other deck", () => {
    const keys = ["a", "b", "c", "d"];
    const seen = new Set(
      Array.from({ length: 200 }, () => randomDeckKey(keys, "a")),
    );
    expect(seen).toEqual(new Set(["b", "c", "d"]));
  });
});

describe("one simple picker (#161)", () => {
  const mine = [
    {
      id: "d1",
      name: "Club/Red",
      deck: { name: "Club/Red", monsterDeck: [], mainDeck: [] },
    },
  ];

  it("/play lists the Starter decks, then My decks, and nothing else", () => {
    const options = playDeckOptions(mine);
    expect(options.map((o) => o.kind)).toEqual([
      "official",
      "official",
      "mine",
    ]);
    expect(pickerGroups(options).map((g) => g.label)).toEqual([
      "Starter decks",
      "My decks",
    ]);
    // A folder carries over as part of the deck's name.
    expect(options.at(-1)?.label).toBe("Club/Red");
  });

  it("/debug lists the Starter decks, My decks and the random test decks", () => {
    const groups = pickerGroups(deckOptions(mine)).map((g) => g.label);
    expect(groups).toEqual(["Starter decks", "My decks", "Random test decks"]);
  });

  it("the old /debug imports move to My decks once, skipping a deck saved with the same name and list", () => {
    const deck = (name: string, n: string) => {
      const parsed = parseDeckList(
        `[deck] ${name}\n[monster deck]\n1 ESD01-001\n[main deck]\n4 ${n}\n`,
      ).decks[0];
      if (!parsed) throw new Error(name);
      return parsed;
    };
    const same = deck("Same", "ESD01-016");
    const changed = deck("Changed", "ESD01-016");
    const fresh = deck("Fresh", "ESD01-016");
    const saved = [
      { name: "Same", list: formatDeckList([same]) },
      { name: "Changed", list: formatDeckList([deck("Changed", "ESD01-017")]) },
    ];
    expect(
      importsToMove([same, changed, fresh], saved).map((d) => d.name),
    ).toEqual(["Changed", "Fresh"]);
  });
});
