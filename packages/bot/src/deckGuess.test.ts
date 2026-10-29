import { readFileSync } from "node:fs";
import { type Card, validateDeck } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { weightedBot } from "./baseline";
import { guessHidden } from "./deckGuess";
import { determinize } from "./determinize";
import { m12Bot, PRESETS } from "./difficulty";
import { botInput, decklistsOf, seededRng } from "./input";
import { ismctsBot } from "./ismcts";

const AS_OF = new Date("2026-10-28T12:00:00Z");

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}

/** A shuffled copy (seeded). */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe("the generic deck guess (Q42, 6.1.1)", () => {
  it("over 200 seeded guesses across EBP01–EBP04, the seen cards plus the guess make a legal deck (sizes, colors, copies, icon 2, restriction list, Resonance)", () => {
    let checked = 0;
    // 200 guesses, each for a test deck that is legal today (a guess can't fix a seen card).
    for (let i = 0; checked < 200 && i < 1000; i++) {
      const set = ["EBP01", "EBP02", "EBP03", "EBP04"][i % 4] as string;
      const real = buildTestDeck(set, `guess-${i}`);
      if (!validateDeck(real, AS_OF).legal) continue;
      const rng = seededRng(`guess-${i}`);
      const rankOne = real.monsterDeck.find((c) => c.rank === 1) as Card;
      // Some monsters and main-deck cards have been seen; the rest is hidden.
      const seenMonsters = [
        rankOne,
        ...real.monsterDeck.filter((c) => c.rank !== 1 && rng() < 0.4),
      ];
      const seenMain = shuffled(real.mainDeck, rng).slice(
        0,
        Math.floor(rng() * 40),
      );
      const guess = guessHidden(
        {
          rankOne,
          seen: [...seenMonsters, ...seenMain],
          hiddenMain: 50 - seenMain.length,
          hiddenRanks: [1, 2, 3, 4].filter(
            (r) => !seenMonsters.some((m) => m.rank === r),
          ),
          asOf: AS_OF,
        },
        rng,
      );
      const deck = {
        monsterDeck: [...seenMonsters, ...guess.monsterDeck],
        mainDeck: [...seenMain, ...guess.main],
      };
      expect(validateDeck(deck, AS_OF).failures, `guess ${i} (${set})`).toEqual(
        [],
      );
      checked++;
    }
    expect(checked).toBe(200);
  });

  it("Resonance: a Multi-Purpose Fighting System 3 (EBP03-006) deck's guess keeps [weapon] or [mech] monster and battle cards", () => {
    const card = (n: string) =>
      getAllCards().find((c) => c.cardNumber === n) as Card;
    const rankOne = card("EBP03-006");
    for (let i = 0; i < 20; i++) {
      const guess = guessHidden(
        {
          rankOne,
          seen: [rankOne],
          hiddenMain: 50,
          hiddenRanks: [2, 3, 4],
          asOf: AS_OF,
        },
        seededRng(`resonance-${i}`),
      );
      const deck = {
        monsterDeck: [rankOne, ...guess.monsterDeck],
        mainDeck: guess.main,
      };
      expect(validateDeck(deck, AS_OF).failures).toEqual([]);
    }
  });

  it("seen cards count against the copy limit (6.1.1.4) and the restriction list", () => {
    const esd01 = official("esd01-starter.txt");
    const rankOne = esd01.monsterDeck.find((c) => c.rank === 1) as Card;
    const battle = esd01.mainDeck.find((c) => c.type === "Battle") as Card;
    const gravityBeam = getAllCards().find(
      (c) => c.cardNumber === "EBP01-079",
    ) as Card;
    for (let i = 0; i < 30; i++) {
      const guess = guessHidden(
        {
          rankOne,
          seen: [rankOne, battle, battle, battle, battle],
          hiddenMain: 46,
          hiddenRanks: [2, 3, 4],
          asOf: AS_OF,
        },
        seededRng(`copies-${i}`),
      );
      const numbers = guess.main.map((c) => c.deckCardNumber);
      expect(numbers).not.toContain(battle.deckCardNumber);
      // Gravity Beam is banned on this date (restriction list, Sep 1, 2026).
      expect(numbers).not.toContain(gravityBeam.deckCardNumber);
      expect(guess.main).toHaveLength(46);
      expect(guess.monsterDeck.map((c) => c.rank)).toEqual([2, 3, 4]);
    }
  });
});

describe("hidden decklists (Q42)", () => {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd01-starter.txt") },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
  /** A state a few turns in, at P1's decision. */
  const midGame = (): GameState => {
    const lists = decklistsOf(decks);
    const rng = seededRng("hidden");
    let state = advanceToDecision(startGame({ seed: "hidden", decks }));
    while (
      state.turn < 5 ||
      (state.pendingChoice?.player ?? state.turnPlayer) !== "P1"
    ) {
      const who = state.pendingChoice?.player ?? state.turnPlayer;
      const action = weightedBot.chooseAction(botInput(state, who, lists, rng));
      state = advanceToDecision(applyAction(state, action));
    }
    return state;
  };
  const BUDGET = { iterations: 60, maxMs: Number.POSITIVE_INFINITY };

  it("a bot gets only its own decklist; `knowsDecklists` keeps both (tools only)", () => {
    const state = midGame();
    const lists = decklistsOf(decks);
    expect(
      Object.keys(botInput(state, "P1", lists, seededRng(1)).knowledge.decks),
    ).toEqual(["P1"]);
    expect(
      botInput(state, "P1", lists, seededRng(1), { knowsDecklists: true })
        .knowledge.decks,
    ).toEqual(lists);
  });

  it("no peeking, extended: different hidden opponent decks with the same public information give the same bot action", () => {
    const state = midGame();
    // The opponent's hidden cards (hand and deck) become other cards entirely: an ESD01 deck's.
    const variant = JSON.parse(JSON.stringify(state)) as GameState;
    const opp = variant.players.find((p) => p.id === "P2");
    if (!opp) throw new Error("P2");
    const others = official("esd01-starter.txt").mainDeck;
    for (const card of others) variant.cards[card.id] = card;
    for (const [i, c] of [...opp.hand, ...opp.deck].entries())
      c.cardId = (others[i % others.length] as Card).id;
    const otherDecks: [PlayerSetup, PlayerSetup] = [
      decks[0],
      { id: "P2", monsterDeck: decks[1].monsterDeck, mainDeck: others },
    ];
    const a = botInput(state, "P1", decklistsOf(decks), seededRng("x"), BUDGET);
    const b = botInput(
      variant,
      "P1",
      decklistsOf(otherDecks),
      seededRng("x"),
      BUDGET,
    );
    expect({ ...b, rng: null }).toEqual({ ...a, rng: null });
    expect(ismctsBot.chooseAction(b)).toEqual(ismctsBot.chooseAction(a));
  });

  it("`knowsDecklists` reproduces the old behavior exactly: hard-m12 decides as with both decklists passed straight in", () => {
    const hardM12 = m12Bot("hard-m12", PRESETS.hard);
    expect(hardM12.knowsDecklists).toBe(true);
    const lists = decklistsOf(decks);
    let state = advanceToDecision(startGame({ seed: "old", decks }));
    const rng = seededRng("old-play");
    for (let n = 0; n < 12 && state.result === null; n++) {
      const who = state.pendingChoice?.player ?? state.turnPlayer;
      const seed = `old-${n}`;
      const now = botInput(state, who, lists, seededRng(seed), {
        knowsDecklists: true,
        ...BUDGET,
      });
      // The input as botInput built it before Q42: both decklists, no date.
      const before = {
        ...now,
        rng: seededRng(seed),
        knowledge: { decks: lists, log: now.knowledge.log },
        settings: BUDGET,
      };
      const action = hardM12.chooseAction(now);
      expect(action).toEqual(hardM12.chooseAction(before));
      expect(getLegalActions(state, who)).toContainEqual(action);
      // And the determinized opponent is drawn from their real decklist, as before.
      const det = determinize(now.view, now.knowledge, seededRng(seed));
      expect(det).toEqual(
        determinize(before.view, before.knowledge, seededRng(seed)),
      );
      state = advanceToDecision(
        applyAction(
          state,
          weightedBot.chooseAction(botInput(state, who, lists, rng)),
        ),
      );
    }
  });
});
