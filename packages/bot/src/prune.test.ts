import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameState,
  type PlayerSetup,
  type PlayerState,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { decklistsOf, seededRng, botInput } from "./input";
import { decide } from "./ismcts";
import { deadKeys, isDeadAction } from "./prune";

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

let nextId = 950000;
function add(state: GameState, number: string, owner: string): CardInstance {
  const card = real(number);
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase play timing, its monster in zone 6 (strategy cards up to rank 6). */
function base(): { state: GameState; p1: PlayerState; p2: PlayerState } {
  let state = advanceToDecision(startGame({ seed: "prune", decks: DECKS }));
  while (state.turnPlayer !== "P1" || state.pendingChoice) {
    const decider = state.pendingChoice?.player ?? state.turnPlayer;
    const choice = state.pendingChoice;
    state = advanceToDecision(
      applyAction(
        state,
        choice
          ? {
              type: "choose",
              player: decider,
              choiceId: choice.id,
              optionId: choice.options[0]!.id,
            }
          : { type: "pass", player: decider },
      ),
    );
  }
  const [p1, p2] = state.players;
  p1.monsterPosition = 6;
  // The hand goes to the discard pile, so every card stays accounted for (the bot's decklists).
  p1.discard.push(...p1.hand);
  p1.hand = [];
  p2.rage = 0;
  return { state, p1, p2 };
}

const activate = (p1: PlayerState, card: CardInstance): Action => ({
  type: "activateStrategy",
  player: p1.id,
  cardInstanceId: card.instanceId,
  strategyZone: 1,
});

describe("dead-card pruning (M13a), from the engine's result", () => {
  it("Scale Attack (EBP01-061) with the opponent at 4 rage does nothing: dead; at 5 it reduces their rage: live", () => {
    const { state, p1, p2 } = base();
    const card = add(state, "EBP01-061", p1.id);
    p1.hand.push(card);
    p2.rage = 4;
    expect(isDeadAction(state, activate(p1, card), p1.id)).toBe(true);
    p2.rage = 5;
    expect(isDeadAction(state, activate(p1, card), p1.id)).toBe(false);
  });

  it("Godzilla vs. Destoroyah (EBP01-062): dead when the counter is made without it; live when it makes the counter", () => {
    const { state, p1 } = base();
    const card = add(state, "EBP01-062", p1.id);
    p1.hand.push(card);
    // A [destoroyah] battle card in zone 2 turns the +10,000 on.
    p1.zones[2].push([add(state, "EBP01-049", p1.id)]);
    // Two more battle cards: the counter is made without the +10,000 (7.4.3).
    p1.zones[3].push([add(state, "ESD02-010", p1.id)]);
    p1.zones[4].push([add(state, "ESD02-010", p1.id)]);
    expect(isDeadAction(state, activate(p1, card), p1.id)).toBe(true);
    // Without the extra battle cards the counter isn't made, and the +10,000 can change that.
    p1.zones[3] = [];
    p1.zones[4] = [];
    expect(isDeadAction(state, activate(p1, card), p1.id)).toBe(false);
  });

  it("battle cards, monster plays and passes are never dead; with only dead actions, none is pruned", () => {
    const { state, p1, p2 } = base();
    const card = add(state, "EBP01-061", p1.id);
    p1.hand.push(card);
    p2.rage = 4;
    const pass: Action = { type: "pass", player: p1.id };
    expect(isDeadAction(state, pass, p1.id)).toBe(false);
    const key = (a: Action) => JSON.stringify(a);
    expect([
      ...deadKeys(state, [activate(p1, card), pass], p1.id, key),
    ]).toEqual([key(activate(p1, card))]);
    expect(deadKeys(state, [activate(p1, card)], p1.id, key).size).toBe(0);
  });
});

describe("the search with pruning on (Medium and up)", () => {
  it("never picks a dead activation while passing is possible", () => {
    const { state, p1, p2 } = base();
    // Scale Attack replaces a deck card, so the decklist the bot knows still adds up.
    const out = p1.deck.pop() as CardInstance;
    const card = add(state, "EBP01-061", p1.id);
    p1.hand.push(card);
    p2.rage = 4;
    const main = [...DECKS[0].mainDeck];
    main.splice(
      main.findIndex((c) => c.id === out.cardId),
      1,
      real("EBP01-061"),
    );
    const lists = decklistsOf([{ ...DECKS[0], mainDeck: main }, DECKS[1]]);
    for (let i = 0; i < 8; i++) {
      const decision = decide(
        botInput(state, p1.id, lists, seededRng(`prune-${i}`), {
          iterations: 60,
          maxMs: 1e9,
          prune: 1,
        }),
      );
      expect(decision.search?.dead.size).toBeGreaterThan(0);
      expect(decision.action.type).not.toBe("activateStrategy");
    }
  });
});
