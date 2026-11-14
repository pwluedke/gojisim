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
  type ZoneNumber,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import type { Decklist } from "./types";
import { GAM } from "./wranglerPlan";
import {
  GODZILLA_1954_WIPE,
  KING,
  LANDING,
  wranglerV2Verdict,
} from "./wranglerPlanV2";

/** The Wrangler plan v2 (Paul, Nov 13): its lines on built positions. */

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

/** 2N1XB's shape: the Wrangler monster deck and core cards. */
const WRANGLER: Decklist = (() => {
  const main = [
    "EBP01-075",
    "EBP01-073",
    "ESC01-004",
    "EBP01-030",
    "EBP03-004",
    "EBP01-015",
    "EBP01-004",
  ].flatMap((n) => [real(n), real(n), real(n)]);
  while (main.length < 50) main.push(real("EBP01-002"));
  return {
    monsterDeck: ["EBP01-001", "ESD01-002", "EBP01-008", "EBP01-010"].map(real),
    mainDeck: main,
  };
})();

let nextId = 960000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `w${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase on `turn`: P1's monster in `at` (top EBP01-010), P2's in `oppAt`, P1's hand. */
function position(hand: string[], at: ZoneNumber, oppAt: ZoneNumber, turn = 5) {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd01-starter.txt") },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "wrangler-v2", decks }));
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
  const [p1, p2] = state.players as [PlayerState, PlayerState];
  state.turn = turn;
  p1.invadingMonsterZone = [add(state, real("EBP01-010"), "P1")];
  p1.monsterPosition = at;
  p1.hand = hand.map((n) => add(state, real(n), "P1"));
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    p1.zones[z] = [];
    p2.zones[z] = [];
  }
  p2.monsterPosition = oppAt;
  return { state, p1, p2 };
}

const ofCard = (state: GameState, p1: PlayerState, a: Action) =>
  "cardInstanceId" in a
    ? state.cards[
        p1.hand.find((c) => c.instanceId === a.cardInstanceId)?.cardId ?? -1
      ]?.deckCardNumber
    : undefined;

describe("the Wrangler plan v2", () => {
  it("don't race: an invasion that doesn't win this turn is argued against; one that wins isn't", () => {
    const early = position(["EBP01-002"], 3, 2);
    const legal = getLegalActions(early.state, "P1");
    const invades = legal.filter((a) => a.type === "invade");
    expect(invades.length).toBeGreaterThan(0);
    const { against } = wranglerV2Verdict(early.state, legal, "P1", WRANGLER);
    for (const a of invades) expect(against.has(a)).toBe(true);
    // From zone 8 with the opponent's zone 8 empty, the invasion wins (5.13.1.1.2).
    const win = position(["EBP01-002"], 8, 2);
    const legalWin = getLegalActions(win.state, "P1");
    const winInvades = legalWin.filter((a) => a.type === "invade");
    expect(winInvades.length).toBeGreaterThan(0);
    const v = wranglerV2Verdict(win.state, legalWin, "P1", WRANGLER);
    for (const a of winInvades) expect(v.against.has(a)).toBe(false);
  });

  it("a push (Godzilla Landing) is argued against unless it makes the counter or the opponent tramples their own battle card", () => {
    const plain = position([LANDING], 4, 2);
    const legal = getLegalActions(plain.state, "P1");
    const landing = legal.filter(
      (a) =>
        a.type === "activateStrategy" &&
        ofCard(plain.state, plain.p1, a) === LANDING,
    );
    expect(landing.length).toBeGreaterThan(0);
    const v = wranglerV2Verdict(plain.state, legal, "P1", WRANGLER);
    for (const a of landing) expect(v.against.has(a)).toBe(true);
    // Their own battle card in zone 3, their monster in zone 2: the push makes them trample it.
    const trample = position([LANDING], 4, 2);
    trample.p2.zones[3] = [[add(trample.state, real("ESD02-012"), "P2")]];
    const legalT = getLegalActions(trample.state, "P1");
    const vt = wranglerV2Verdict(trample.state, legalT, "P1", WRANGLER);
    for (const a of legalT)
      if (
        a.type === "activateStrategy" &&
        ofCard(trample.state, trample.p1, a) === LANDING
      )
        expect(vt.against.has(a)).toBe(false);
  });

  it("Kings go in zones 1, 2 or 8, off the bot's own monster's path", () => {
    const { state, p1 } = position([KING], 3, 8);
    const legal = getLegalActions(state, "P1");
    const kings = legal.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" && ofCard(state, p1, a) === KING,
    );
    expect(kings.some((a) => [1, 2, 8].includes(a.zone))).toBe(true);
    const { against } = wranglerV2Verdict(state, legal, "P1", WRANGLER);
    for (const a of kings)
      expect(against.has(a)).toBe(![1, 2, 8].includes(a.zone));
  });

  it("churn from turn 1: rage discards over passing, but the held Godzilla (1954) EBP01-004 stays until a King is out", () => {
    const { state, p1 } = position(["EBP01-002", GODZILLA_1954_WIPE], 1, 1, 1);
    const legal = getLegalActions(state, "P1");
    const { against, rescued } = wranglerV2Verdict(
      state,
      legal,
      "P1",
      WRANGLER,
    );
    for (const a of legal) {
      if (a.type === "pass") expect(against.has(a)).toBe(true);
      if (a.type === "gainRage") {
        const n = ofCard(state, p1, a);
        expect(rescued.has(a)).toBe(n !== GODZILLA_1954_WIPE);
      }
    }
  });

  it("Godzilla (1954) EBP01-004 isn't stacked with a King on the board", () => {
    const { state, p1 } = position([GODZILLA_1954_WIPE], 3, 2);
    // EBP01-004 is rank 3: stack it on a rank 3 top.
    p1.invadingMonsterZone = [add(state, real("EBP01-008"), "P1")];
    p1.zones[1] = [[add(state, real(KING), "P1")]];
    const legal = getLegalActions(state, "P1");
    const stacks = legal.filter(
      (a) =>
        a.type === "playMonster" && ofCard(state, p1, a) === GODZILLA_1954_WIPE,
    );
    expect(stacks.length).toBeGreaterThan(0);
    const { against } = wranglerV2Verdict(state, legal, "P1", WRANGLER);
    for (const a of stacks) expect(against.has(a)).toBe(true);
  });

  it("isn't on for a deck that isn't a Wrangler", () => {
    const { state } = position(["EBP01-002"], 3, 2);
    const starter = official("esd01-starter.txt");
    const v = wranglerV2Verdict(state, getLegalActions(state, "P1"), "P1", {
      monsterDeck: starter.monsterDeck,
      mainDeck: starter.mainDeck,
    });
    expect(v.against.size + v.rescued.size).toBe(0);
    void GAM;
  });
});
