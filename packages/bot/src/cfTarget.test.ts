import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  type CardInstance,
  type GameState,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { cfTargetDead } from "./cfTarget";

// Paul's Constructed Future test setting (Nov 4, 2026): which card cost discards aim SD05-005 at.

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

let nextId = 960000;
/** P1 holding exactly `hand`, with Constructed Future in its deck when `future`. */
function holding(hand: string[], future: boolean) {
  const state = startGame({
    seed: "cf",
    decks: [
      { id: "P1", ...official("esd01-starter.txt") },
      { id: "P2", ...official("esd02-starter.txt") },
    ],
  });
  const add = (number: string): CardInstance => {
    const card = real(number);
    state.cards = { ...state.cards, [card.id]: card };
    return { instanceId: `c${nextId++}`, cardId: card.id, owner: "P1" };
  };
  const p1 = state.players[0]!;
  p1.hand = hand.map(add);
  if (future) p1.deck.push(add("SD05-005"));
  return { state, cards: p1.hand };
}
const invades = (cards: CardInstance[]): Action[] =>
  cards.map((c) => ({
    type: "invade",
    player: "P1",
    cardInstanceId: c.instanceId,
  }));
const numbers = (state: GameState, actions: Iterable<Action>) =>
  [...actions]
    .map((a) =>
      a.type === "invade"
        ? state.cards[
            state.players[0]!.hand.find(
              (c) => c.instanceId === a.cardInstanceId,
            )!.cardId
          ]!.deckCardNumber
        : "",
    )
    .sort();

const MK = "EBP02-068";
const GAM = "EBP01-073";
const OTHER = "EBP02-061";

describe("cfTarget (tools-only Hard rules setting)", () => {
  it("auto rules nothing out", () => {
    const { state, cards } = holding([MK, GAM, OTHER], true);
    expect(cfTargetDead(state, invades(cards), "P1", "auto").size).toBe(0);
  });

  it("23: an invade discards Mecha-King Ghidorah when it can; otherwise GAM is kept while another card can pay", () => {
    const one = holding([MK, GAM, OTHER], true);
    expect(
      numbers(
        one.state,
        cfTargetDead(one.state, invades(one.cards), "P1", "23"),
      ),
    ).toEqual([GAM, OTHER].sort());
    const two = holding([GAM, OTHER], true);
    expect(
      numbers(
        two.state,
        cfTargetDead(two.state, invades(two.cards), "P1", "23"),
      ),
    ).toEqual([GAM]);
  });

  it("gam: GAM pays first; without GAM, Mecha-King Ghidorah is kept while a Constructed Future is in hand or deck", () => {
    const one = holding([MK, GAM, OTHER], true);
    expect(
      numbers(
        one.state,
        cfTargetDead(one.state, invades(one.cards), "P1", "gam"),
      ),
    ).toEqual([MK, OTHER].sort());
    const two = holding([MK, OTHER], true);
    expect(
      numbers(
        two.state,
        cfTargetDead(two.state, invades(two.cards), "P1", "gam"),
      ),
    ).toEqual([MK]);
    // No Constructed Future left: Mecha-King Ghidorah may pay.
    const three = holding([MK, OTHER], false);
    expect(
      cfTargetDead(three.state, invades(three.cards), "P1", "gam").size,
    ).toBe(0);
  });

  it("a single way to pay is never ruled out", () => {
    const { state, cards } = holding([GAM], true);
    expect(cfTargetDead(state, invades(cards), "P1", "23").size).toBe(0);
  });

  it("a choice of cards in hand (a discard cost) follows the policy too", () => {
    const { state, cards } = holding([MK, OTHER], true);
    state.pendingChoice = {
      id: 1,
      player: "P1",
      kind: "card",
      rule: "5.7.1",
      options: cards.map((c) => ({ id: c.instanceId, cardId: c.cardId })),
    } as unknown as GameState["pendingChoice"];
    const choose = cards.map((c): Action => ({
      type: "choose",
      player: "P1",
      choiceId: 1,
      optionId: c.instanceId,
    }));
    const dead = cfTargetDead(state, choose, "P1", "23");
    expect([...dead].map((a) => a.type === "choose" && a.optionId)).toEqual([
      cards[1]!.instanceId,
    ]);
  });

  it("23one: a second Mecha-King Ghidorah isn't discarded for a cost while one is in the discard pile; the first may be", () => {
    const first = holding([MK, OTHER], true);
    expect(
      cfTargetDead(first.state, invades(first.cards), "P1", "23one").size,
    ).toBe(0);
    const second = holding([MK, OTHER], true);
    const mk = getAllCards().find(
      (c) => c.cardNumber === MK && c.parentId === null,
    ) as Card;
    second.state.cards = { ...second.state.cards, [mk.id]: mk };
    second.state.players[0]!.discard.push({
      instanceId: "c-discarded-mk",
      cardId: mk.id,
      owner: "P1",
    });
    expect(
      numbers(
        second.state,
        cfTargetDead(second.state, invades(second.cards), "P1", "23one"),
      ),
    ).toEqual([MK]);
    // Mecha-King Ghidorah the only way to pay: kept.
    const only = holding([MK], true);
    only.state.players[0]!.discard.push({
      instanceId: "c-discarded-mk-2",
      cardId: mk.id,
      owner: "P1",
    });
    expect(
      cfTargetDead(only.state, invades(only.cards), "P1", "23one").size,
    ).toBe(0);
  });
});
