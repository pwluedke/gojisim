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
import { actionKey, mxPlanFavored } from "./ismcts";
import { mxPlanV2Verdict, wipesBoard } from "./mxPlanV2";

// Paul's Monster X plan v2 (`mxPlan=2`, Nov 9, 2026, the play guide's edit): every position below
// is made up, on the starter decks with the cards each rule needs.

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

let nextId = 990000;
function add(state: GameState, number: string, owner: string): CardInstance {
  const card = real(number);
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `m${nextId++}`, cardId: card.id, owner };
}

interface Setup {
  /** P1's own turn count (1 = its first turn). */
  turn?: number;
  position?: ZoneNumber;
  oppPosition?: ZoneNumber;
  monster?: string;
  oppMonster?: string;
  hand?: string[];
  deck?: string[];
  discard?: string[];
  zones?: Partial<Record<ZoneNumber, string>> | undefined;
  oppZones?: Partial<Record<ZoneNumber, string>> | undefined;
  oppRage?: number;
}

/** P1's main phase with a Monster X monster deck, the rest as given. */
function position(setup: Setup) {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd01-starter.txt") },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "mx-plan", decks }));
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
  // P1's turns are the odd ones when it went first, else the even ones.
  const offset = state.turn % 2 === 1 ? 1 : 0;
  state.turn = 2 * (setup.turn ?? 5) - offset;
  p1.monsterPosition = setup.position ?? 7;
  p2.monsterPosition = setup.oppPosition ?? 8;
  p1.invadingMonsterZone = [add(state, setup.monster ?? "EBP04-031", "P1")];
  p1.monsterDeck = [add(state, "EBP04-032", "P1")];
  if (setup.oppMonster)
    p2.invadingMonsterZone = [add(state, setup.oppMonster, "P2")];
  p1.rage = 0;
  p2.rage = setup.oppRage ?? 0;
  p1.hand = (setup.hand ?? []).map((n) => add(state, n, "P1"));
  if (setup.deck) p1.deck = setup.deck.map((n) => add(state, n, "P1"));
  p1.discard = (setup.discard ?? []).map((n) => add(state, n, "P1"));
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    p1.zones[z] = setup.zones?.[z] ? [[add(state, setup.zones[z], "P1")]] : [];
    p2.zones[z] = setup.oppZones?.[z]
      ? [[add(state, setup.oppZones[z], "P2")]]
      : [];
  }
  p1.strategyZones = [[], []];
  p2.strategyZones = [[], []];
  return { state, p1, p2, decks, legal: getLegalActions(state, "P1") };
}
const numberOf = (state: GameState, p1: PlayerState, a: Action) => {
  const id = "cardInstanceId" in a ? a.cardInstanceId : null;
  const card = p1.hand.find((c) => c.instanceId === id);
  return card ? state.cards[card.cardId]?.deckCardNumber : undefined;
};

const against = (s: ReturnType<typeof position>) =>
  mxPlanV2Verdict(s.state, s.legal, "P1");
const ruleOf = (s: ReturnType<typeof position>, pick: (a: Action) => boolean) =>
  [...against(s)].filter(([a]) => pick(a)).map(([, r]) => r);
const isPass = (a: Action) => a.type === "pass";

describe("Paul's Monster X plan v2 (mxPlan=2)", () => {
  it("is the default, through mxPlanFavored", () => {
    const s = position({
      turn: 2,
      hand: ["EBP04-057"],
      oppZones: { 8: "EBP04-038" },
    });
    const fav = mxPlanFavored(s.state, s.legal, "P1", (a) =>
      actionKey(s.state, a),
    );
    // Early with a battle card to play: pass isn't favored.
    expect(fav.has(actionKey(s.state, s.legal.find(isPass)!))).toBe(false);
  });

  it("rule 1: early, no pass while a battle card can be played; a new color beats a stronger card", () => {
    const s = position({
      turn: 2,
      hand: ["EBP04-044", "EBP04-057"],
      zones: { 1: "EBP04-038" },
      oppZones: { 8: "EBP04-038" },
    });
    expect(ruleOf(s, isPass)).toEqual([1]);
    const dead = against(s);
    const hedorah = s.legal.filter(
      (a) =>
        a.type === "playBattle" && numberOf(s.state, s.p1, a) === "EBP04-044",
    );
    expect(hedorah.length).toBeGreaterThan(0);
    expect(hedorah.every((a) => dead.has(a))).toBe(true);
    // From turn 5, pass is free again (no rage or Landing in hand to push it).
    const late = position({
      turn: 6,
      hand: ["EBP04-057"],
      oppZones: { 8: "EBP04-038" },
    });
    expect(ruleOf(late, isPass)).toEqual([]);
  });

  it("rule 2: no play onto your own battle card unless it's weaker and a color is missing", () => {
    const s = position({
      hand: ["EBP04-057"],
      zones: { 1: "EBP04-068" },
      oppZones: { 8: "EBP04-038" },
    });
    const onto = s.legal.filter((a) => a.type === "playBattle" && a.zone === 1);
    expect(onto.length).toBeGreaterThan(0);
    expect(onto.every((a) => against(s).get(a) === 2)).toBe(true);
    // Covering a weaker red card with a stronger green one sends red to the discard pile: rule 2
    // allows it (rule 1 may still prefer an empty zone, which keeps both colors).
    const ok = position({
      hand: ["EBP04-068"],
      zones: { 1: "EBP04-038" },
      oppZones: { 8: "EBP04-038" },
    });
    const cover = ok.legal.filter(
      (a) => a.type === "playBattle" && a.zone === 1,
    );
    expect(cover.length).toBeGreaterThan(0);
    expect(cover.every((a) => against(ok).get(a) !== 2)).toBe(true);
  });

  it("rule 3: invading pays with a non-key card of a new discard color", () => {
    const s = position({
      position: 8,
      hand: ["EBP04-044", "EBP04-057", "EBP03-079"],
      discard: ["EBP04-038"],
    });
    const dead = against(s);
    const alive = s.legal.filter((a) => a.type === "invade" && !dead.has(a));
    expect(alive.map((a) => numberOf(s.state, s.p1, a))).toEqual(["EBP04-057"]);
  });

  it("rules 4 and 5: Entangling Fear whenever it can be cast; never on a turn you invade", () => {
    const s = position({
      turn: 6,
      position: 4,
      hand: ["EBP04-081"],
      oppZones: { 8: "EBP04-038" },
    });
    expect(ruleOf(s, isPass)).toEqual([4]);
    const win = position({
      turn: 6,
      position: 8,
      hand: ["EBP04-081", "EBP04-057"],
    });
    const fear = win.legal.filter(
      (a) =>
        a.type === "activateStrategy" &&
        numberOf(win.state, win.p1, a) === "EBP04-081",
    );
    expect(fear.length).toBeGreaterThan(0);
    expect(fear.every((a) => against(win).get(a) === 4)).toBe(true);
  });

  it("rule 6: early, no pass while a monster card can go for rage", () => {
    const s = position({
      turn: 3,
      monster: "EBP04-032",
      hand: ["EBP04-034"],
      oppZones: { 8: "EBP04-038" },
    });
    expect(ruleOf(s, isPass)).toEqual([6]);
    const late = position({
      turn: 6,
      monster: "EBP04-032",
      hand: ["EBP04-034"],
      oppZones: { 8: "EBP04-038" },
    });
    expect(ruleOf(late, isPass)).toEqual([]);
  });

  it("rule 7: at rank 4, EBP04-035 over EBP04-036 only when its wipe takes 2+ cards or the zone 8 blocker", () => {
    const wipe = (oppZones: Setup["oppZones"]) => {
      const s = position({
        turn: 6,
        monster: "EBP04-036",
        hand: ["EBP04-035"],
        discard: ["EBP04-038", "EBP04-057"],
        oppZones,
      });
      const play = s.legal.filter(
        (a) =>
          a.type === "playMonster" &&
          numberOf(s.state, s.p1, a) === "EBP04-035",
      );
      expect(play.length).toBeGreaterThan(0);
      return play.some((a) => !against(s).has(a));
    };
    expect(wipe({ 2: "EBP04-068" })).toBe(false);
    expect(wipe({ 2: "EBP04-068", 8: "EBP04-068" })).toBe(true);
  });

  it("rule 13: vs King Ghidorah from their rank 3, Captured! stays in hand", () => {
    const keep = (oppMonster: string) => {
      const s = position({
        turn: 6,
        oppMonster,
        oppRage: 2,
        hand: ["EBP03-079"],
        zones: { 1: "EBP04-068" },
        oppZones: { 8: "EBP04-038" },
      });
      const play = s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP03-079",
      );
      expect(play.length).toBeGreaterThan(0);
      return [...new Set(play.map((a) => against(s).get(a)))];
    };
    // King Ghidorah (1991) is rank 1: rule 10 decides (it makes the counter, so no objection).
    expect(keep("EBP02-047")).toEqual([undefined]);
    // A rank 3 King Ghidorah: kept for the wipe.
    expect(keep("EBP02-049")).toEqual([13]);
  });

  it("rule 8: Final Wars with 2 or fewer battle cards, or when the counter isn't made", () => {
    const fw = (zones: Setup["zones"], oppRage = 0) => {
      const s = position({
        hand: ["EBP04-079"],
        zones,
        oppRage,
        oppZones: { 8: "EBP04-038" },
      });
      const play = s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP04-079",
      );
      expect(play.length).toBeGreaterThan(0);
      return play.some((a) => !against(s).has(a));
    };
    expect(fw({ 1: "EBP04-068", 2: "EBP04-068" })).toBe(true);
    // Three strong cards make the counter: hold it.
    expect(fw({ 1: "EBP04-068", 2: "EBP04-068", 3: "EBP04-068" })).toBe(false);
    // The same three short of a raged threat: cast it.
    expect(fw({ 1: "EBP04-068", 2: "EBP04-068", 3: "EBP04-068" }, 8)).toBe(
      true,
    );
  });

  it("rule 9: Landing whenever it can be cast", () => {
    const s = position({
      turn: 6,
      hand: ["EBP01-030"],
      oppPosition: 4,
      oppZones: { 8: "EBP04-038" },
    });
    expect(ruleOf(s, isPass)).toEqual([9]);
  });

  it("rule 10: Captured! only when nothing else makes this turn's counter", () => {
    const cap = (hand: string[]) => {
      const s = position({
        turn: 6,
        oppRage: 2,
        hand,
        zones: { 1: "EBP04-068" },
        oppZones: { 8: "EBP04-038" },
      });
      const play = s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP03-079",
      );
      expect(play.length).toBeGreaterThan(0);
      return play.some((a) => !against(s).has(a));
    };
    expect(cap(["EBP03-079"])).toBe(true);
    // A second Kaizer Ghidorah (2004) makes it without the reset: hold Captured!.
    expect(cap(["EBP03-079", "EBP04-068"])).toBe(false);
  });

  it("rule 11: Kaizer Ghidorah EBP04-068 only in zones 1-3 or 8", () => {
    const s = position({
      turn: 6,
      hand: ["EBP04-068"],
      oppZones: { 7: "EBP04-038" },
    });
    const dead = against(s);
    const zones = (alive: boolean) =>
      s.legal
        .filter((a) => a.type === "playBattle" && dead.has(a) !== alive)
        .map((a) => (a.type === "playBattle" ? a.zone : 0))
        .sort();
    expect(zones(true)).toEqual([1, 2, 3, 8]);
    expect(zones(false)).toEqual([4, 5, 6]);
  });

  it("rule 12: Monster Island with zones 1-5 full, or once the opponent has shown a board wipe", () => {
    const island = (setup: Setup) => {
      const s = position({ turn: 6, hand: ["EBP01-080"], ...setup });
      const play = s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP01-080",
      );
      expect(play.length).toBeGreaterThan(0);
      return play.some((a) => !against(s).has(a));
    };
    expect(island({ zones: { 1: "EBP04-038" } })).toBe(false);
    // A Godzilla vs. Megaguirus (its zone wipe) in their zones' ... discard pile counts as shown.
    const s = position({
      turn: 6,
      hand: ["EBP01-080"],
      zones: { 1: "EBP04-038" },
    });
    s.p2.discard.push(add(s.state, "EBP01-064", "P2"));
    const play = s.legal.filter(
      (a) =>
        a.type === "activateStrategy" &&
        numberOf(s.state, s.p1, a) === "EBP01-080",
    );
    expect(
      play.some((a) => !mxPlanV2Verdict(s.state, s.legal, "P1").has(a)),
    ).toBe(true);
  });

  it("wipesBoard reads 'destroy all', a computed count and a zone wipe as board wipes; one removal isn't", () => {
    expect(wipesBoard("EBP03-029")).toBe(true);
    expect(wipesBoard("EBP04-035")).toBe(true);
    expect(wipesBoard("EBP01-064")).toBe(true);
    expect(wipesBoard("EBP04-034")).toBe(false);
  });

  it("rule 14: invade for a win, a key strategy's zone from turn 5, or when it's faster; else not", () => {
    // Their zone 8 is blocked: no win in sight, not faster.
    const no = position({
      turn: 6,
      position: 3,
      hand: ["EBP04-057"],
      oppZones: { 8: "EBP04-038" },
    });
    const invades = no.legal.filter((a) => a.type === "invade");
    expect(invades.length).toBeGreaterThan(0);
    expect(invades.every((a) => against(no).get(a) === 14)).toBe(true);
    // Godzilla Captured! (rank 7) in hand at zone 6, and the invasion reaches 7.
    const zone = position({
      turn: 6,
      position: 6,
      hand: ["EBP04-057", "EBP03-079"],
      oppZones: { 8: "EBP04-038" },
    });
    const pay = zone.legal.filter(
      (a) =>
        a.type === "invade" && numberOf(zone.state, zone.p1, a) === "EBP04-057",
    );
    expect(pay.some((a) => !against(zone).has(a))).toBe(true);
  });
});
