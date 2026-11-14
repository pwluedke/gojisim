import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
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
import type { Decklist } from "./types";
import {
  DESPAIR,
  GAM,
  isWranglerDeck,
  MECHA_KING,
  wranglerLines,
  wranglerVerdict,
} from "./wranglerPlan";

/** The Wrangler plan (#276): archetype fit, card-gated lines, and line 1 on built positions. */

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

/** A Wrangler-like list (red Godzilla monster deck, the core cards), with or without Despair. */
function wrangler(withDespair: boolean): Decklist {
  const core = ["EBP01-075", "EBP01-073", "ESC01-004", "EBP01-030"];
  const main = [
    ...core.flatMap((n) => [real(n), real(n), real(n)]),
    ...(withDespair ? [real(DESPAIR)] : []),
    real("EBP01-008"),
  ];
  while (main.length < 50) main.push(real("EBP01-002"));
  return {
    monsterDeck: ["EBP01-001", "ESD01-002", "EBP01-008", "EBP01-010"].map(real),
    mainDeck: main,
  };
}

let nextId = 980000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${nextId++}`, cardId: card.id, owner };
}

/** P1's play timing: Despair and Godzilla Against Mechagodzilla in hand, Mecha-King in their zone 1. */
function position(rage: number) {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd01-starter.txt") },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "wrangler", decks }));
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
  p1.hand = [
    add(state, real(DESPAIR), "P1"),
    add(state, real(GAM), "P1"),
    add(state, real("EBP01-002"), "P1"),
  ];
  p1.rage = rage;
  // Despair's rank 3 needs P1's monster in zone 3 or later (8.3.1).
  p1.monsterPosition = 3;
  p2.zones[1] = [[add(state, real(MECHA_KING), "P2")]];
  // Their monster far enough along that Despair can be played (8.3.1).
  p2.monsterPosition = 7;
  return state;
}

describe("the Wrangler plan (#276)", () => {
  it("a Wrangler-like deck by archetype: a red Godzilla monster deck and 3 of the core cards; the starters aren't", () => {
    expect(isWranglerDeck(wrangler(true))).toBe(true);
    expect(isWranglerDeck(wrangler(false))).toBe(true);
    expect(
      isWranglerDeck({
        monsterDeck: official("esd02-starter.txt").monsterDeck,
        mainDeck: official("esd02-starter.txt").mainDeck,
      }),
    ).toBe(false);
  });

  it("Paul's card gating: line 1 needs Despair and Godzilla Against Mechagodzilla in the bot's own list (the Despangler has both; 15AHV has no Despair)", () => {
    expect(wranglerLines(wrangler(true)).despair).toBe(true);
    expect(wranglerLines(wrangler(false)).despair).toBe(false);
    // Without the cards, the plan says nothing.
    const state = position(0);
    const legal = getLegalActions(state, "P1");
    const off = wranglerVerdict(state, legal, "P1", wrangler(false));
    expect(off.against.size + off.rescued.size).toBe(0);
  });

  it("line 1, under 2 rage: the rage discards are favored and freed; other moves are argued against", () => {
    const state = position(0);
    const legal = getLegalActions(state, "P1");
    const { against, rescued } = wranglerVerdict(
      state,
      legal,
      "P1",
      wrangler(true),
    );
    const rage = legal.filter((a) => a.type === "gainRage");
    expect(rage.length).toBeGreaterThan(0);
    for (const a of rage) expect(rescued.has(a)).toBe(true);
    for (const a of legal)
      if (a.type === "activateStrategy" || a.type === "pass")
        expect(against.has(a)).toBe(true);
  });

  it("line 1 waits while Despair can't hit Mecha-King: P1's monster before zone 3 (8.3.1), or Mecha-King past P1's monster", () => {
    const early = position(0);
    early.players[0]!.monsterPosition = 2;
    const legal = getLegalActions(early, "P1");
    expect(
      wranglerVerdict(early, legal, "P1", wrangler(true)).rescued.size,
    ).toBe(0);
    const past = position(0);
    const p2 = past.players[1]!;
    p2.zones[5] = p2.zones[1];
    p2.zones[1] = [];
    expect(
      wranglerVerdict(past, getLegalActions(past, "P1"), "P1", wrangler(true))
        .rescued.size,
    ).toBe(0);
  });

  it("line 1's cards, Godzilla Against Mechagodzilla and Despair, aren't paid for an invasion once a Mecha-King is public (zones or the opponent's list), from turn 3; before that the guard is off", () => {
    const pays = (
      turn: number,
      mechaKingInZones: boolean,
      theirs?: Decklist,
    ) => {
      const state = position(0);
      state.turn = turn;
      // Mecha-King past Despair's reach (zone 5, the bot's monster in 3), so line 1's chase is off
      // and only the guard speaks.
      const p2 = state.players[1]!;
      if (mechaKingInZones) p2.zones[5] = p2.zones[1];
      p2.zones[1] = [];
      const legal = getLegalActions(state, "P1");
      const { against } = wranglerVerdict(
        state,
        legal,
        "P1",
        wrangler(true),
        theirs,
      );
      return [GAM, DESPAIR].map((n) => {
        const card = state.players[0]!.hand.find(
          (c) => state.cards[c.cardId]?.deckCardNumber === n,
        )!;
        const invades = legal.filter(
          (a) => a.type === "invade" && a.cardInstanceId === card.instanceId,
        );
        expect(invades.length).toBeGreaterThan(0);
        return invades.every((a) => against.has(a));
      });
    };
    const withMechaKing: Decklist = {
      monsterDeck: [],
      mainDeck: [real(MECHA_KING)],
    };
    expect(pays(3, true)).toEqual([true, true]);
    expect(pays(3, false, withMechaKing)).toEqual([true, true]);
    expect(pays(2, true)).toEqual([false, false]);
    expect(pays(3, false)).toEqual([false, false]);
  });

  it("line 1, at 2 rage: Despair is the move; everything else is argued against", () => {
    const state = position(2);
    const legal = getLegalActions(state, "P1");
    const { against } = wranglerVerdict(state, legal, "P1", wrangler(true));
    const despair = legal.filter(
      (a) =>
        a.type === "activateStrategy" &&
        state.cards[
          state.players[0]!.hand.find((c) => c.instanceId === a.cardInstanceId)
            ?.cardId ?? -1
        ]?.deckCardNumber === DESPAIR,
    );
    expect(despair.length).toBeGreaterThan(0);
    for (const a of legal)
      if (a.type !== "concede")
        expect(against.has(a)).toBe(!despair.includes(a));
  });

  it("line 2 (#274 point 1): from game turn 3 the rage discards are freed and favored over passing, but Godzilla (2004) and Godzilla (1954) are held; on turns 1-2 card rule 14 decides", () => {
    const at = (turn: number) => {
      const state = position(0);
      state.turn = turn;
      const p2 = state.players[1]!;
      p2.zones[1] = [];
      const p1 = state.players[0]!;
      p1.hand = [
        add(state, real("EBP01-002"), "P1"),
        add(state, real("EBP01-008"), "P1"),
        add(state, real("EBP01-004"), "P1"),
      ];
      const legal = getLegalActions(state, "P1");
      const v = wranglerVerdict(state, legal, "P1", wrangler(false));
      const rageOf = (n: string) =>
        legal.find(
          (a) =>
            a.type === "gainRage" &&
            state.cards[
              p1.hand.find((c) => c.instanceId === a.cardInstanceId)!.cardId
            ]?.deckCardNumber === n,
        )!;
      const pass = legal.find((a) => a.type === "pass")!;
      return {
        churn: v.rescued.has(rageOf("EBP01-002")),
        held: [rageOf("EBP01-008"), rageOf("EBP01-004")].every((a) =>
          v.against.has(a),
        ),
        pass: v.against.has(pass),
      };
    };
    expect(at(3)).toEqual({ churn: true, held: true, pass: true });
    expect(at(2)).toEqual({ churn: false, held: false, pass: false });
  });

  it("line 1 goes first: with Despair's line on, line 2 doesn't argue against Despair at 2 rage", () => {
    const state = position(2);
    state.turn = 5;
    const legal = getLegalActions(state, "P1");
    const { against } = wranglerVerdict(state, legal, "P1", wrangler(true));
    const despair = legal.filter((a) => a.type === "activateStrategy");
    expect(despair.length).toBeGreaterThan(0);
    for (const a of despair) expect(against.has(a)).toBe(false);
    for (const a of legal)
      if (a.type === "pass") expect(against.has(a)).toBe(true);
  });

  it("line 3 (Ian, Nov 12): with Godzilla (2023) ESD01-002 the top monster card, invade paying with Godzilla (2004); no pass, stack or rage for it until then; off without ESD01-002 on top", () => {
    const verdict = (fetcherOnTop: boolean) => {
      const state = position(0);
      state.turn = 5;
      state.players[1]!.zones[1] = [];
      const p1 = state.players[0]!;
      if (fetcherOnTop)
        p1.invadingMonsterZone = [add(state, real("ESD01-002"), "P1")];
      p1.hand = [
        add(state, real("EBP01-008"), "P1"),
        add(state, real("EBP01-002"), "P1"),
      ];
      const legal = getLegalActions(state, "P1");
      const of = (type: string, n: string) =>
        legal.filter(
          (a) =>
            a.type === type &&
            "cardInstanceId" in a &&
            state.cards[
              p1.hand.find((c) => c.instanceId === a.cardInstanceId)!.cardId
            ]?.deckCardNumber === n,
        );
      const v = wranglerVerdict(state, legal, "P1", wrangler(false));
      return { legal, v, of };
    };
    const on = verdict(true);
    const pay = on.of("invade", "EBP01-008");
    expect(pay.length).toBeGreaterThan(0);
    for (const a of pay) expect(on.v.against.has(a)).toBe(false);
    for (const a of [
      ...on.of("invade", "EBP01-002"),
      ...on.of("gainRage", "EBP01-008"),
      ...on.legal.filter((a) => a.type === "pass" || a.type === "playMonster"),
    ])
      expect(on.v.against.has(a)).toBe(true);
    const off = verdict(false);
    for (const a of off.of("invade", "EBP01-002"))
      expect(off.v.against.has(a)).toBe(false);
  });
});
