import { describe, expect, it } from "vitest";
import type { NamedDeck } from "@gojisim/cards/deck-lists";
import {
  type DeckOption,
  deckOptions,
  optionLegality,
  tournamentProblems,
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
