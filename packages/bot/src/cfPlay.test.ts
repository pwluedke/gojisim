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
  getLegalActions,
  type PlayerSetup,
  type PlayerState,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { constructedFutureDead, constructedFuturePlays } from "./cfPlay";

// Paul's Constructed Future play rule (Nov 5, 2026): play it only for Mecha-King Ghidorah or a
// GAM whose own condition is met (8.2, M2: 8+ monster cards in the discard pile).

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

let nextId = 970000;
function add(state: GameState, number: string, owner: string): CardInstance {
  const card = real(number);
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase, monster in zone 6, 3 Crystals in its zones, Constructed Future in hand. */
function base(discard: string[]) {
  let state = advanceToDecision(
    startGame({
      seed: "cf-play",
      decks: [
        { id: "P1", ...official("esd01-starter.txt") },
        { id: "P2", ...official("esd02-starter.txt") },
      ],
    }),
  );
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
  const p1 = state.players[0] as PlayerState;
  const p2 = state.players[1] as PlayerState;
  p1.monsterPosition = 6;
  p2.monsterPosition = 8;
  p1.discard = discard.map((n) => add(state, n, "P1"));
  for (const zone of [1, 2, 3] as const)
    p1.zones[zone] = [[add(state, "EBP02-T03", "P1")]];
  const cf = add(state, "SD05-005", "P1");
  p1.hand = [cf];
  const activate = getLegalActions(state, "P1").find(
    (a) => a.type === "activateStrategy" && a.cardInstanceId === cf.instanceId,
  ) as Action;
  return { state, activate };
}
const monsters = (n: number) => Array<string>(n).fill("EBP02-045");

describe("Constructed Future: Paul's play rule (Hard rules layer)", () => {
  it("Mecha-King Ghidorah in the discard pile: the play is kept", () => {
    const { state, activate } = base(["EBP02-068", "EBP02-061"]);
    expect(constructedFuturePlays(state, activate)).toBe("EBP02-068");
    expect(constructedFutureDead(state, [activate], "P1").size).toBe(0);
  });

  it("GAM with 8 monster cards in the discard pile (8.2, M2): the play is kept", () => {
    const { state, activate } = base(["EBP01-073", ...monsters(8)]);
    expect(constructedFuturePlays(state, activate)).toBe("EBP01-073");
    expect(constructedFutureDead(state, [activate], "P1").size).toBe(0);
  });

  it("GAM with only 7 monster cards can't be played: anything else it would play makes the play dead", () => {
    const { state, activate } = base([
      "EBP01-073",
      "EBP02-061",
      ...monsters(7),
    ]);
    expect(constructedFuturePlays(state, activate)).not.toBe("EBP01-073");
    expect(constructedFutureDead(state, [activate], "P1")).toEqual(
      new Set([activate]),
    );
  });

  it("nothing to play: the play is dead", () => {
    const { state, activate } = base(monsters(3));
    expect(constructedFuturePlays(state, activate)).toBeNull();
    expect(constructedFutureDead(state, [activate], "P1").size).toBe(1);
  });
});
