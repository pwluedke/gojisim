import { SPACEG_ONE, SPACEG_THREE } from "./spacegPlan";
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
import { ENTANGLING_FEAR } from "./mxPlan";
import { hasPlan, type NoPlanOptions, noPlanVerdict } from "./noPlan";
import type { Decklist } from "./types";

/**
 * #460's no-plan play on made-up positions: a starter game (ESD01, a deck with no plan) with P1's
 * monster, hand and zones set by hand.
 */
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

const STARTER = official("esd01-starter.txt") as unknown as Decklist;
/** A Tangler list as its plan recognizes one. */
const TANGLER = {
  monsterDeck: ["EBP03-014", "EBP03-015"].map(real),
  mainDeck: [ENTANGLING_FEAR].map(real),
} as unknown as Decklist;

let nextId = 980000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `n${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase: P1's monster (`top`) in `at`, P2's in `oppAt`, P1's hand. */
function position(
  hand: string[],
  top: string,
  at: ZoneNumber,
  oppAt: ZoneNumber,
) {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd01-starter.txt") },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "no-plan", decks }));
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
  p1.monsterPosition = at;
  p1.hand = hand.map((n) => add(state, real(n), "P1"));
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    p1.zones[z] = [];
    p2.zones[z] = [];
  }
  p2.monsterPosition = oppAt;
  return { state, p1 };
}

const judge = (
  state: GameState,
  options: NoPlanOptions = {},
  own: Decklist = STARTER,
) => {
  const legal = getLegalActions(state, "P1");
  return { legal, against: noPlanVerdict(state, legal, "P1", own, options) };
};
const of = (v: ReturnType<typeof judge>, type: Action["type"]) =>
  v.legal.filter((a) => a.type === type).map((a) => v.against.has(a));

describe("the no-plan play (#460)", () => {
  it("knows the decks with a plan: Tangler yes, the ESD01 starter no", () => {
    const { state } = position([], "ESD01-001", 2, 2);
    expect(hasPlan(state, "P1", STARTER, false)).toBe(false);
    expect(hasPlan(state, "P1", TANGLER, false)).toBe(true);
  });

  it("SpaceG has a plan only while `spacegPlan` is on (#408)", () => {
    const { state } = position([], "ESD01-001", 2, 2);
    const spaceg = {
      monsterDeck: [SPACEG_ONE, SPACEG_THREE].map(real),
      mainDeck: [],
    } as unknown as Decklist;
    expect(hasPlan(state, "P1", spaceg, false, true)).toBe(true);
    expect(hasPlan(state, "P1", spaceg, false, false)).toBe(false);
  });

  it("rule 1 (`noPlanUse`): no passing while a battle card can be played; nothing with a plan or switched off", () => {
    // Shinseimaru is rank 2: playable with their monster in zone 2 (8.2.1).
    const { state } = position(["ESD01-008"], "ESD01-001", 2, 2);
    const v = judge(state, { invade: false });
    expect(of(v, "playBattle").length).toBeGreaterThan(0);
    for (const d of of(v, "pass")) expect(d).toBe(true);
    for (const d of of(judge(state, { use: false, invade: false }), "pass"))
      expect(d).toBe(false);
    for (const d of of(judge(state, { invade: false }, TANGLER), "pass"))
      expect(d).toBe(false);
  });

  it("rule 2 (`noPlanInvade`): an invasion with nothing to gain waits; one by a monster with [invading] doesn't", () => {
    // The rank I Godzilla (2023) ESD01-001 has no [invading]; ESD01-002 does.
    const plain = position(["ESD01-013"], "ESD01-001", 2, 2).state;
    const v = judge(plain, { use: false });
    expect(of(v, "invade").length).toBeGreaterThan(0);
    for (const d of of(v, "invade")) expect(d).toBe(true);
    for (const d of of(judge(plain, { use: false, invade: false }), "invade"))
      expect(d).toBe(false);
    const fetch = position(["ESD01-013"], "ESD01-002", 2, 2).state;
    for (const d of of(judge(fetch, { use: false }), "invade"))
      expect(d).toBe(false);
  });
});
