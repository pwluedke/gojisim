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
import {
  ANGUIRUS_2004,
  FEST_RANK_FOUR,
  festVerdict,
  GODZILLA_1954_BATTLE,
  isFestDeck,
  RIDE,
  SPACE_BEAM,
} from "./festPlan";
import type { Decklist } from "./types";

/** Slick's Red Fest plan (Nov 13): the archetype, and lines 2-5 on built positions. */

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

/** A Fest list: the Fest monster deck, the Fest rank III and IV, and the plan's cards. */
const FEST: Decklist = (() => {
  const main = [
    "EBP01-013",
    FEST_RANK_FOUR,
    ANGUIRUS_2004,
    RIDE,
    GODZILLA_1954_BATTLE,
    SPACE_BEAM,
  ].flatMap((n) => [real(n), real(n)]);
  while (main.length < 50) main.push(real("ESD01-005"));
  return {
    monsterDeck: ["EBP01-011", "EBP01-012", "EBP01-008", "EBP01-010"].map(real),
    mainDeck: main,
  };
})();

let nextId = 970000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `f${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase, P1's monster `top` in zone 3, the opponent's in `oppAt`, P1's hand `hand`. */
function position(top: string, hand: string[], oppAt: ZoneNumber = 2) {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd01-starter.txt") },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "fest", decks }));
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
  p1.invadingMonsterZone = [add(state, real(top), "P1")];
  p1.monsterPosition = 3;
  p1.hand = hand.map((n) => add(state, real(n), "P1"));
  p1.discard = [];
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

describe("the Red Fest plan", () => {
  it("a Fest deck by archetype: the Fest monster deck and the Fest rank III and IV; a starter isn't", () => {
    expect(isFestDeck(FEST)).toBe(true);
    const starter = official("esd01-starter.txt");
    expect(
      isFestDeck({
        monsterDeck: starter.monsterDeck,
        mainDeck: starter.mainDeck,
      }),
    ).toBe(false);
  });

  it("line 2: no invasion before rank IV; from rank IV, and with 3 monster cards to rage, a Space Beam and the opponent's zone 8 clear, it may invade", () => {
    const invadesAgainst = (top: string, hand: string[]) => {
      const { state } = position(top, hand);
      const legal = getLegalActions(state, "P1");
      const invades = legal.filter((a) => a.type === "invade");
      expect(invades.length).toBeGreaterThan(0);
      const { against } = festVerdict(state, legal, "P1", FEST);
      return invades.every((a) => against.has(a));
    };
    expect(invadesAgainst("EBP01-011", ["ESD01-005", "ESD01-006"])).toBe(true);
    expect(invadesAgainst("EBP01-010", ["ESD01-005", "ESD01-006"])).toBe(false);
    // The exception: 3 monster cards to rage, a Space Beam, the opponent's zone 8 empty.
    expect(
      invadesAgainst("EBP01-011", [
        "ESD01-005",
        "ESD01-006",
        "ESD01-007",
        SPACE_BEAM,
      ]),
    ).toBe(false);
  });

  it("line 3: Anguirus (2004) EBP02-016 goes in zone 1 or 2", () => {
    const { state, p1 } = position("EBP01-010", [ANGUIRUS_2004], 7);
    const legal = getLegalActions(state, "P1");
    const plays = legal.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" && ofCard(state, p1, a) === ANGUIRUS_2004,
    );
    expect(plays.some((a) => a.zone === 1 || a.zone === 2)).toBe(true);
    const { against } = festVerdict(state, legal, "P1", FEST);
    for (const a of plays)
      if (a.zone === 1 || a.zone === 2) expect(against.has(a)).toBe(false);
    expect(
      plays.some((a) => a.zone !== 1 && a.zone !== 2 && against.has(a)),
    ).toBe(true);
  });

  it("line 4: with no Ride in the discard pile, a Ride goes on your own Ride when it can", () => {
    const { state, p1 } = position("EBP01-010", [RIDE], 7);
    p1.zones[4] = [[add(state, real(RIDE), "P1")]];
    const legal = getLegalActions(state, "P1");
    const rides = legal.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" && ofCard(state, p1, a) === RIDE,
    );
    expect(rides.some((a) => a.zone === 4)).toBe(true);
    const { against } = festVerdict(state, legal, "P1", FEST);
    for (const a of rides) expect(against.has(a)).toBe(a.zone !== 4);
    // With a Ride already in the discard pile, the line is off.
    p1.discard = [add(state, real(RIDE), "P1")];
    const off = festVerdict(state, getLegalActions(state, "P1"), "P1", FEST);
    expect(off.against.size).toBe(0);
  });

  it("line 5: against Monster X, the rank IV Fest with 2 battle cards in your zones over passing", () => {
    const monsterX = getAllCards().find(
      (c) =>
        c.name === "Monster X" && c.type === "Monster" && c.parentId === null,
    ) as Card;
    const theirs: Decklist = { monsterDeck: [monsterX], mainDeck: [] };
    const { state, p1 } = position("EBP01-010", [FEST_RANK_FOUR], 7);
    p1.zones[1] = [[add(state, real("ESD01-016"), "P1")]];
    p1.zones[2] = [[add(state, real("ESD01-016"), "P1")]];
    const legal = getLegalActions(state, "P1");
    const fest4 = legal.filter(
      (a) =>
        a.type === "playMonster" && ofCard(state, p1, a) === FEST_RANK_FOUR,
    );
    expect(fest4.length).toBeGreaterThan(0);
    const { against } = festVerdict(state, legal, "P1", FEST, theirs);
    for (const a of legal)
      if (a.type === "pass") expect(against.has(a)).toBe(true);
    for (const a of fest4) expect(against.has(a)).toBe(false);
    // Not against Monster X: no line 5.
    const plain = festVerdict(state, legal, "P1", FEST);
    for (const a of legal)
      if (a.type === "pass") expect(plain.against.has(a)).toBe(false);
  });
});
