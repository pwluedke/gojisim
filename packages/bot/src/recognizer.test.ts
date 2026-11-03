import { readFileSync } from "node:fs";
import { type Card, validateDeck } from "@gojisim/cards";
import { findCardByNumber, parseDeckList } from "@gojisim/cards/deck-lists";
import {
  advanceToDecision,
  applyAction,
  type GameState,
  type PlayerId,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { weightedBot } from "./baseline";
import { guessHidden } from "./deckGuess";
import { determinize } from "./determinize";
import { difficultySettings, PRESETS } from "./difficulty";
import { botInput, decklistsOf, seededRng } from "./input";
import {
  archetypeCards,
  archetypes,
  archetypeWeights,
  pickArchetype,
} from "./recognizer";

const AS_OF = new Date("2026-10-28T12:00:00Z");
const card = (n: string) => {
  const c = findCardByNumber(n);
  if (!c) throw new Error(n);
  return c;
};
const top = (seen: Card[], rankOne?: Card) => {
  const w = archetypeWeights(seen, rankOne, AS_OF);
  const best = w.reduce((a, b) => (b.weight > a.weight ? b : a));
  return { name: best.archetype?.name ?? "none", weight: best.weight, w };
};
const weightOf = (w: ReturnType<typeof top>["w"], name: string) =>
  w.find((x) => (x.archetype?.name ?? "none") === name)?.weight ?? 0;

describe("the deck recognizer (#191): archetypes from public cards", () => {
  it("reads every catalog card (no unknown card numbers) and covers the approved archetypes", () => {
    const names = archetypes().map((a) => a.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Tangler",
        "Bungler",
        "Monster X",
        "KG 23dorah",
        "Red Rage",
        "Kiryu",
      ]),
    );
    for (const a of archetypes())
      expect(a.core.length, a.name).toBeGreaterThan(0);
  });

  it("two or three tells pick the archetype: Godzilla (2002) with Entangling Fear and Godzilla vs. Destoroyah is Tangler", () => {
    const r = top([card("EBP04-081"), card("EBP01-062")], card("EBP03-014"));
    expect(r.name).toBe("Tangler");
    expect(r.weight).toBeGreaterThan(0.8);
  });

  it("the weights are worked out again from what's public, so a shared rank I's early read corrects itself", () => {
    // EBP03-014 is Tangler's and Bungler's rank I: alone, it leaves both open.
    const early = top([], card("EBP03-014")).w;
    expect(weightOf(early, "Tangler")).toBeGreaterThan(0.15);
    expect(weightOf(early, "Bungler")).toBeGreaterThan(0.15);
    // Then GAM and King of the Monsters are played: Bungler.
    const later = top(
      [card("EBP01-073"), card("EBP01-075"), card("EBP02-036")],
      card("EBP03-014"),
    );
    expect(later.name).toBe("Bungler");
  });

  it("a deck that matches nothing keeps today's uniform guess", () => {
    // Cards no archetype lists, under a rank I none of them uses.
    const catalogued = new Set(
      archetypes().flatMap((a) => [...a.coreNumbers, ...a.commonNumbers]),
    );
    const others = ["EBP01-044", "EBP04-080", "EBP01-045", "EBP01-063"]
      .map(card)
      .filter((c) => !catalogued.has(c.deckCardNumber));
    const offMeta = ["EBP02-030", "EBP03-071", "EBP04-074", "EBP01-079"]
      .map((n) => findCardByNumber(n))
      .filter(
        (c): c is Card => c !== undefined && !catalogued.has(c.deckCardNumber),
      );
    const seen = [...others, ...offMeta].slice(0, 3);
    expect(seen.length).toBe(3);
    const r = top(seen, card("EBP01-048"));
    expect(r.name).toBe("none");
    expect(pickArchetype([{ archetype: null, weight: 1 }], () => 0.5)).toBe(
      null,
    );
  });
});

describe("the deck recognizer (#191): draws", () => {
  it("over 100 seeded draws, an archetype's cards go first and the deck stays legal (6.1.1)", () => {
    const tangler = archetypes().find((a) => a.name === "Tangler");
    if (!tangler) throw new Error("Tangler");
    const rankOne = card("EBP03-014");
    let withCore = 0;
    for (let i = 0; i < 100; i++) {
      const rng = seededRng(`recognizer-${i}`);
      const bias = archetypeCards(tangler, [rankOne], rng);
      const guess = guessHidden(
        {
          rankOne,
          seen: [rankOne],
          hiddenMain: 50,
          hiddenRanks: [2, 3, 4],
          asOf: AS_OF,
        },
        rng,
        bias,
      );
      const deck = {
        monsterDeck: [rankOne, ...guess.monsterDeck],
        mainDeck: guess.main,
      };
      expect(validateDeck(deck, AS_OF).failures, `draw ${i}`).toEqual([]);
      const fear = guess.main.filter(
        (c) => c.deckCardNumber === "EBP04-081",
      ).length;
      if (fear === 4) withCore++;
    }
    // Entangling Fear is core x4: every draw holds all four.
    expect(withCore).toBe(100);
  });

  it("determinize with the recognizer keeps every count and the public cards, as without it", () => {
    const official = (file: string): Omit<PlayerSetup, "id"> => {
      const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
      const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
      if (!deck) throw new Error(file);
      return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
    };
    const decks: [PlayerSetup, PlayerSetup] = [
      { id: "P1", ...official("esd01-starter.txt") },
      { id: "P2", ...official("esd02-starter.txt") },
    ];
    const lists = decklistsOf(decks);
    const rng = seededRng("recognizer-det");
    let state = advanceToDecision(startGame({ seed: "recognizer", decks }));
    let checked = 0;
    for (let n = 0; state.result === null && n < 120; n++) {
      const who: PlayerId = state.pendingChoice?.player ?? state.turnPlayer;
      if (n % 10 === 0) {
        const input = botInput(state, who, lists, rng);
        const d: GameState = determinize(input.view, input.knowledge, rng, {
          recognizer: true,
        });
        for (const p of state.players) {
          const q = d.players.find((x) => x.id === p.id);
          expect(q?.hand.length).toBe(p.hand.length);
          expect(q?.deck.length).toBe(p.deck.length);
          expect(q?.discard).toEqual(p.discard);
        }
        checked++;
      }
      state = advanceToDecision(
        applyAction(
          state,
          weightedBot.chooseAction(botInput(state, who, lists, rng)),
        ),
      );
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("is on from Hard up only", () => {
    expect(difficultySettings(PRESETS.hard).recognizer).toBe(1);
    expect(difficultySettings(100).recognizer).toBe(1);
    expect(difficultySettings(PRESETS.medium).recognizer).toBe(0);
    expect(difficultySettings(PRESETS.easy).recognizer).toBe(0);
  });
});
