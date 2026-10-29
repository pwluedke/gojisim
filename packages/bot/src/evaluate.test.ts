import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  applyAction,
  type CardInstance,
  counterPowerOf,
  type GameState,
  getThreat,
  type PlayerSetup,
  type PlayerState,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { randomBot, weightedBot } from "./baseline";
import { DEFAULT_WEIGHTS, evaluate, FEATURES, features } from "./evaluate";
import { greedyBot } from "./greedy";
import { botInput, decklistsOf, seededRng } from "./input";

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const DECKS: [PlayerSetup, PlayerSetup] = [
  { id: "P1", ...official("esd01-starter.txt") },
  { id: "P2", ...official("esd02-starter.txt") },
];
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

/** A fresh game at its first decision, with a fixed baseline: zone 3, no rage, empty hands, P1's turn. */
function base(): { state: GameState; p1: PlayerState; p2: PlayerState } {
  const state = advanceToDecision(startGame({ seed: "eval", decks: DECKS }));
  const [p1, p2] = state.players;
  for (const p of state.players) {
    p.monsterPosition = 3;
    p.rage = 0;
    p.hand = [];
  }
  state.turnPlayer = "P1";
  state.turnFlags = { invasionUsed: false, monsterPlayed: false };
  return { state, p1, p2 };
}

let nextId = 900000;
function add(state: GameState, number: string, owner: string): CardInstance {
  const card = real(number);
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${nextId++}`, cardId: card.id, owner };
}

describe("evaluation features (M6b), each on a hand-built state", () => {
  it("position: own zone minus the opponent's, over 7", () => {
    const { state, p1, p2 } = base();
    p1.monsterPosition = 7;
    p2.monsterPosition = 3;
    expect(features(state, "P1").position).toBeCloseTo(4 / 7);
  });

  it("blocker: a battle card in your own zone 8 (5.13.1.1.1)", () => {
    const { state, p2 } = base();
    p2.zones[8] = [[add(state, "ESD02-011", "P2")]];
    expect(features(state, "P2").blocker).toBe(1);
    expect(features(state, "P1").blocker).toBe(-1);
  });

  it("winThreat: in zone 8, the opponent's zone 8 open, an invasion still available", () => {
    const { state, p1, p2 } = base();
    p1.monsterPosition = 8;
    p1.hand = [add(state, "ESD01-011", "P1")];
    expect(features(state, "P1").winThreat).toBe(1);
    state.turnFlags.invasionUsed = true;
    expect(features(state, "P1").winThreat).toBe(0);
    state.turnFlags.invasionUsed = false;
    p2.zones[8] = [[add(state, "ESD02-011", "P2")]];
    expect(features(state, "P1").winThreat).toBe(0);
  });

  it("countersLeft: 5 minus the current monster's rank, over 4", () => {
    const { state, p1, p2 } = base();
    p1.invadingMonsterZone = [add(state, "ESD01-004", "P1")]; // rank IV
    p2.invadingMonsterZone = [add(state, "ESD02-001", "P2")]; // rank I
    expect(features(state, "P1").countersLeft).toBeCloseTo((1 - 4) / 4);
  });

  it("counterEdge: counter power against the opponent's threat, over 20,000, clamped", () => {
    const { state, p1 } = base();
    p1.zones[2] = [[add(state, "ESD02-013", "P1")]]; // 13,000 counter power
    const p1Edge = (counterPowerOf(state, p1) - getThreat(state, "P2")) / 20000;
    const p2Edge =
      (counterPowerOf(state, state.players[1]) - getThreat(state, "P1")) /
      20000;
    const clamp = (x: number) => Math.max(-1, Math.min(1, x));
    expect(features(state, "P1").counterEdge).toBeCloseTo(
      clamp(p1Edge) - clamp(p2Edge),
    );
  });

  it("nextMonster: a legal next monster for a counter exists (5.15.1.2)", () => {
    const { state, p1 } = base();
    p1.monsterDeck = [];
    expect(features(state, "P1").nextMonster).toBe(-1);
  });

  it("rage, hand, battleCards, icon2, strategyFree: own minus opponent", () => {
    const { state, p1, p2 } = base();
    p1.rage = 2;
    p1.hand = [add(state, "ESD01-012", "P1"), add(state, "ESD01-012", "P1")]; // icon 2 each
    p2.hand = [add(state, "ESD02-011", "P2")];
    p1.zones[2] = [[add(state, "ESD01-011", "P1")]];
    p1.zones[4] = [[add(state, "ESD01-011", "P1")]];
    p1.strategyZones[0] = [
      { card: add(state, "ESD01-016", "P1"), placedOnTurn: 1 },
    ];
    const f = features(state, "P1");
    expect(f.rage).toBeCloseTo(2 / 5);
    expect(f.hand).toBeCloseTo((2 - 1) / 5);
    expect(f.battleCards).toBeCloseTo(2 / 4);
    expect(f.icon2).toBeCloseTo(2 / 2);
    expect(f.strategyFree).toBeCloseTo((1 - 2) / 2);
  });

  it("every feature in FEATURES has a weight", () => {
    for (const f of FEATURES) expect(typeof DEFAULT_WEIGHTS[f]).toBe("number");
  });
});

/** States from a few bot games. */
function gameStates(games: number): GameState[] {
  const found: GameState[] = [];
  const lists = decklistsOf(DECKS);
  for (let game = 0; game < games; game++) {
    const rng = seededRng(`eval-${game}`);
    let state = advanceToDecision(
      startGame({ seed: `eval-${game}`, decks: DECKS }),
    );
    while (state.result === null && state.turn < 60) {
      found.push(state);
      const decider = state.pendingChoice?.player ?? state.turnPlayer;
      const bot = game % 2 ? randomBot : weightedBot;
      state = advanceToDecision(
        applyAction(
          state,
          bot.chooseAction(botInput(state, decider, lists, rng)),
        ),
      );
    }
    found.push(state);
  }
  return found;
}

describe("evaluate (M6b)", () => {
  it("is symmetric: evaluate(s, P1) === -evaluate(s, P2) within 1e-9, on 300 game states", () => {
    const states = gameStates(8).slice(0, 300);
    expect(states.length).toBeGreaterThan(100);
    for (const s of states) {
      const v = evaluate(s, "P1");
      expect(Math.abs(v + evaluate(s, "P2"))).toBeLessThan(1e-9);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("terminal values are exact: win 1, loss -1, draw 0", () => {
    const { state } = base();
    state.result = { winner: "P1", reason: "invasion", rule: "5.13.1.1.2" };
    expect(evaluate(state, "P1")).toBe(1);
    expect(evaluate(state, "P2")).toBe(-1);
    state.result = { winner: null, reason: "draw", rule: "1.2.2" };
    expect(evaluate(state, "P1")).toBe(0);
  });

  it("monotonic: zone 7 scores above zone 5, a zone 8 blocker raises the defender's score, rage +1 raises yours", () => {
    const { state, p1, p2 } = base();
    p1.monsterPosition = 5;
    const at5 = evaluate(state, "P1");
    p1.monsterPosition = 7;
    expect(evaluate(state, "P1")).toBeGreaterThan(at5);

    const before = evaluate(state, "P2");
    p2.zones[8] = [[add(state, "ESD02-011", "P2")]];
    expect(evaluate(state, "P2")).toBeGreaterThan(before);

    const calm = evaluate(state, "P1");
    p1.rage += 1;
    expect(evaluate(state, "P1")).toBeGreaterThan(calm);
  });
});

describe("greedy bot (M6b)", () => {
  it("answers every decision legally, with 1 or 2 samples, and beats random", () => {
    const lists = decklistsOf(DECKS);
    let greedyWins = 0;
    for (let game = 0; game < 10; game++) {
      const rng = seededRng(`greedy-${game}`);
      const greedySeat = game % 2 ? "P2" : "P1";
      let state = advanceToDecision(
        startGame({ seed: `greedy-${game}`, decks: DECKS }),
      );
      while (state.result === null && state.turn < 200) {
        const decider = state.pendingChoice?.player ?? state.turnPlayer;
        const input = botInput(state, decider, lists, rng, {
          samples: game % 3 === 0 ? 2 : 1,
        });
        const bot = decider === greedySeat ? greedyBot : randomBot;
        state = advanceToDecision(applyAction(state, bot.chooseAction(input)));
      }
      if (state.result?.winner === greedySeat) greedyWins++;
    }
    expect(greedyWins).toBeGreaterThanOrEqual(7);
    // 10 whole games: about 1.2 s here, several times that on a CI runner (Q42's deck guess added
    // about half), past the 5 s default.
  }, 20_000);
});
