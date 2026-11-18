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
  counterPowerOf,
  getThreat,
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
    // From turn 5, rule 1 is done; #377's fill the board (rule 18) keeps passing out while the
    // battle card can be played. With it off (`fillBoard: false`), pass is free again.
    const late = position({
      turn: 6,
      hand: ["EBP04-057"],
      oppZones: { 8: "EBP04-038" },
    });
    expect(ruleOf(late, isPass)).toEqual([18]);
    const off = mxPlanV2Verdict(late.state, late.legal, "P1", {
      fillBoard: false,
    });
    expect([...off].filter(([a]) => isPass(a)).map(([, r]) => r)).toEqual([]);
  });

  it("#377 (Paul, Nov 16): fill the board: no passing while a battle card can be played out of reach of their monster's destroy; one only in reach may be held", () => {
    // Their monster in zone 5: their zones 5 and 6 share columns with your zone 1 only.
    const s = position({
      turn: 8,
      hand: ["EBP04-057"],
      oppZones: { 8: "EBP04-038" },
      oppPosition: 5,
    });
    const legal = s.legal;
    const plays = legal.filter((a) => a.type === "playBattle");
    expect(plays.length).toBeGreaterThan(0);
    expect(ruleOf(s, isPass)).toEqual([18]);
    // Every play in reach (only zone 1 open to it): passing is fine.
    const onlyOne = mxPlanV2Verdict(
      s.state,
      legal.filter(
        (a) => a.type !== "playBattle" || (a as { zone: number }).zone === 1,
      ),
      "P1",
    );
    expect([...onlyOne].filter(([a]) => isPass(a))).toEqual([]);
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

  it("rule 9 (#335): no Landing on a monster already in zone 8, nor when this turn's counter is made without it (7.4.3)", () => {
    const landing = (s: ReturnType<typeof position>) =>
      s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP01-030",
      );
    // Their monster in zone 8: Landing can't advance it.
    const at8 = position({
      turn: 6,
      hand: ["EBP01-030"],
      oppPosition: 8,
      oppZones: { 7: "EBP04-038" },
    });
    expect(landing(at8).length).toBeGreaterThan(0);
    for (const a of landing(at8)) expect(against(at8).has(a)).toBe(true);
    // `mxLanding` off (`landing: false`): the old rule 9 casts it anyway.
    const old = mxPlanV2Verdict(at8.state, at8.legal, "P1", { landing: false });
    for (const a of landing(at8)) expect(old.has(a)).toBe(false);
    expect(ruleOf(at8, isPass)).not.toContain(9);
    // The counter made already (three Kaizer Ghidorah EBP04-068): Landing adds nothing.
    const made = position({
      turn: 6,
      hand: ["EBP01-030"],
      oppPosition: 4,
      zones: { 1: "EBP04-068", 2: "EBP04-068", 3: "EBP04-068" },
      oppZones: { 8: "EBP04-038" },
    });
    const me = made.state.players[0] as PlayerState;
    expect(counterPowerOf(made.state, me)).toBeGreaterThanOrEqual(
      getThreat(made.state, "P2"),
    );
    expect(landing(made).length).toBeGreaterThan(0);
    for (const a of landing(made)) expect(against(made).has(a)).toBe(true);
  });

  it("rule 3 (#338, Paul's ruling): Manda (2004) EBP04-045's discount discard only for a card of a color the discard pile's battle cards lack (b)", () => {
    const costPlays = (s: ReturnType<typeof position>) =>
      s.legal.filter(
        (a) =>
          a.type === "playBattle" &&
          numberOf(s.state, s.p1, a) === "EBP04-045" &&
          a.costCardInstanceId !== undefined,
      );
    // Kamacuras (2004) is red, and red is already in the discard pile: pay the full rank.
    const red = position({
      turn: 6,
      hand: ["EBP04-045", "EBP04-038"],
      discard: ["EBP04-038"],
      oppPosition: 4,
      oppZones: { 8: "EBP04-038" },
    });
    expect(costPlays(red).length).toBeGreaterThan(0);
    expect(
      red.legal.some(
        (a) =>
          a.type === "playBattle" &&
          numberOf(red.state, red.p1, a) === "EBP04-045" &&
          !a.costCardInstanceId,
      ),
    ).toBe(true);
    for (const a of costPlays(red)) expect(against(red).has(a)).toBe(true);
    // Gigan (2004) is green, a color the discard pile lacks: the cost may be paid.
    const green = position({
      turn: 6,
      hand: ["EBP04-045", "EBP04-066"],
      discard: ["EBP04-038"],
      oppPosition: 4,
      oppZones: { 8: "EBP04-038" },
    });
    expect(costPlays(green).length).toBeGreaterThan(0);
    for (const a of costPlays(green))
      expect(ruleOf(green, (b) => b === a)).not.toContain(3);
  });

  it("rule 3 (#338, Paul's ruling): Manda (2004)'s discount cheats out the white Monster X EBP03-067 only with 2+ colors among your zones' battle cards (a); otherwise not at all, even with no full-rank play", () => {
    const costPlays = (s: ReturnType<typeof position>) =>
      s.legal.filter(
        (a) =>
          a.type === "playBattle" &&
          numberOf(s.state, s.p1, a) === "EBP04-045" &&
          a.costCardInstanceId !== undefined,
      );
    // White already in the discard pile, so (b) doesn't hold; red and green in zones: (a) does.
    const two = position({
      turn: 6,
      hand: ["EBP04-045", "EBP03-067"],
      discard: ["EBP03-067"],
      zones: { 1: "EBP04-038", 2: "EBP04-066" },
      oppPosition: 4,
      oppZones: { 8: "EBP04-038" },
    });
    expect(costPlays(two).length).toBeGreaterThan(0);
    for (const a of costPlays(two))
      expect(ruleOf(two, (b) => b === a)).not.toContain(3);
    // One color in zones: neither (a) nor (b), so the discount is argued against.
    const one = position({
      turn: 6,
      hand: ["EBP04-045", "EBP03-067"],
      discard: ["EBP03-067"],
      zones: { 1: "EBP04-038" },
      oppPosition: 4,
      oppZones: { 8: "EBP04-038" },
    });
    expect(costPlays(one).length).toBeGreaterThan(0);
    for (const a of costPlays(one)) expect(against(one).has(a)).toBe(true);
    // `mxManda` off (the paired check's control): the old rule 3 leaves it.
    for (const a of costPlays(one))
      expect(
        mxPlanV2Verdict(one.state, one.legal, "P1", { manda: false }).get(a),
      ).not.toBe(3);
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

  it("rule 17 (#371, Paul's record 1dfdd328 move 29): with Monster Island EBP01-080 in your cards, a rank 5 or lower card goes to zones 1-5 off your monster's path, not 6-8; the blue Monster X may go to zone 8 with Kaizer Ghidorah EBP04-068 to evolve into there", () => {
    const rules = (setup: Setup, number: string, zone: number) => {
      const s = position({ turn: 5, position: 3, oppPosition: 7, ...setup });
      const plays = s.legal.filter(
        (a) =>
          a.type === "playBattle" &&
          a.zone === zone &&
          numberOf(s.state, s.p1, a) === number,
      );
      expect(plays.length).toBeGreaterThan(0);
      return ruleOf(s, (a) => plays.includes(a));
    };
    const withIsland = {
      hand: ["EBP03-067", "EBP04-047", "EBP04-068"],
      deck: ["EBP01-080"],
    };
    // The white Monster X: zones 1 and 2, not 6-8 (zones 4 and 5 are its monster's path).
    for (const z of [6, 7, 8])
      expect(rules(withIsland, "EBP03-067", z)).toContain(17);
    for (const z of [1, 2])
      expect(rules(withIsland, "EBP03-067", z)).not.toContain(17);
    // The blue Monster X: zone 8 is fine with Kaizer Ghidorah to come; zone 7 isn't.
    expect(rules(withIsland, "EBP04-047", 8)).not.toContain(17);
    expect(rules(withIsland, "EBP04-047", 7)).toContain(17);
    // No Kaizer Ghidorah: zone 8 is a speed bump too.
    expect(
      rules({ hand: ["EBP04-047"], deck: ["EBP01-080"] }, "EBP04-047", 8),
    ).toContain(17);
    // No Monster Island in your cards: no protection to keep them in.
    expect(
      rules({ hand: ["EBP03-067"], deck: [] }, "EBP03-067", 8),
    ).not.toContain(17);
    // `mxProtectZones: false` (the paired check's control).
    const s = position({ turn: 5, position: 3, oppPosition: 7, ...withIsland });
    const off = mxPlanV2Verdict(s.state, s.legal, "P1", {
      protectZones: false,
    });
    expect([...off.values()]).not.toContain(17);
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

  it("rule 16 (#352, Tuscancow): choosing which of the opponent's zones to hit, one with their Monster X battle cards (EBP04-047, EBP03-067) goes over one with weaker cards (10.5.2.2)", () => {
    const pick = (targets: boolean, oppZones: Setup["oppZones"]) => {
      const { state } = position({ oppZones });
      state.pendingChoice = {
        id: 992,
        player: "P1",
        kind: "zone",
        rule: "10.5.2.2",
        options: [1, 2, 8].map((z) => ({
          id: `P2:${z}`,
          cardId: null,
          abilityId: null,
        })),
      };
      const legal = getLegalActions(state, "P1");
      const dead = mxPlanV2Verdict(state, legal, "P1", { targets });
      return legal
        .filter((a) => a.type === "choose" && !dead.has(a))
        .map((a) => (a.type === "choose" ? a.optionId : ""));
    };
    // Blue Monster X in zone 1, white in zone 2, a weaker battle card in zone 8: 1 and 2 are left.
    const board = { 1: "EBP04-047", 2: "EBP03-067", 8: "EBP04-038" } as const;
    expect(pick(true, board)).toEqual(["P2:1", "P2:2"]);
    // `mxTargets=0` (the paired check's control): every zone stays.
    expect(pick(false, board)).toEqual(["P2:1", "P2:2", "P2:8"]);
    // No Monster X on their board: the rule says nothing.
    expect(pick(true, { 1: "EBP04-038", 8: "EBP04-038" })).toEqual([
      "P2:1",
      "P2:2",
      "P2:8",
    ]);
  });

  it("rule 16 (#352, Tuscancow's record f6025d71, move 24): with all 8 of their zones offered, only the two with their Monster X are left, not Rodan (2004)'s or King Caesar (2004)'s", () => {
    // The record's board: blue Monster X in 1, white in 2, King Caesar in 7, Rodan in 8.
    const { state } = position({
      oppZones: {
        1: "EBP04-047",
        2: "EBP03-067",
        7: "EBP04-057",
        8: "EBP04-046",
      },
    });
    state.pendingChoice = {
      id: 993,
      player: "P1",
      kind: "zone",
      rule: "10.5.2.2",
      options: [1, 2, 3, 4, 5, 6, 7, 8].map((z) => ({
        id: `P2:${z}`,
        cardId: null,
        abilityId: null,
      })),
    };
    const legal = getLegalActions(state, "P1");
    const dead = mxPlanV2Verdict(state, legal, "P1");
    expect(
      legal
        .filter((a) => a.type === "choose" && !dead.has(a))
        .map((a) => (a.type === "choose" ? a.optionId : "")),
    ).toEqual(["P2:1", "P2:2"]);
  });

  it("rule 3 (#370, Paul's R-3 on his game 1dfdd328, turn 1): the white Monster X EBP03-067 isn't Manda (2004)'s discount discard just because the discard pile lacks white; only with 2+ colors in zones", () => {
    const costPlays = (s: ReturnType<typeof position>) =>
      s.legal.filter(
        (a) =>
          a.type === "playBattle" &&
          numberOf(s.state, s.p1, a) === "EBP04-045" &&
          a.costCardInstanceId !== undefined,
      );
    // Turn 1: an empty discard pile (white would be a new color) and one color in zones.
    const turn1 = position({
      turn: 1,
      hand: ["EBP04-045", "EBP03-067"],
      zones: { 1: "EBP04-038" },
      oppPosition: 4,
      oppZones: { 8: "EBP04-038" },
    });
    expect(costPlays(turn1).length).toBeGreaterThan(0);
    for (const a of costPlays(turn1))
      expect(ruleOf(turn1, (b) => b === a)).toContain(3);
    // `mxWhiteKeep: false` (the paired check's control): #338's (b) lets the new color go.
    for (const a of costPlays(turn1))
      expect(
        mxPlanV2Verdict(turn1.state, turn1.legal, "P1", {
          whiteKeep: false,
        }).get(a),
      ).not.toBe(3);
    // Two colors in zones (a): the discount cheats it out, as #338 says.
    const two = position({
      turn: 1,
      hand: ["EBP04-045", "EBP03-067"],
      zones: { 1: "EBP04-038", 2: "EBP04-066" },
      oppPosition: 4,
      oppZones: { 8: "EBP04-038" },
    });
    for (const a of costPlays(two))
      expect(ruleOf(two, (b) => b === a)).not.toContain(3);
  });

  it("rules 4, 5 (#373, Paul's R-5 on his game 1dfdd328, turn 9): no Entangling Fear that holds your monster in zone 4 while Godzilla vs. Megaguirus (rank 5) needs next turn's advance (8.3.1) and the counter is made", () => {
    const fearPlays = (s: ReturnType<typeof position>) =>
      s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP04-081",
      );
    // Your monster in zone 4, the counter made (three Kaizer Ghidorah EBP04-068), GvM in hand.
    // Turn 4: rule 14 (b) doesn't invade toward GvM's zone yet, so it's rule 4's call alone.
    const reach = position({
      turn: 4,
      position: 4,
      hand: ["EBP04-081", "EBP01-064"],
      oppPosition: 4,
      zones: { 1: "EBP04-068", 2: "EBP04-068", 3: "EBP04-068" },
      oppZones: { 8: "EBP04-038" },
    });
    const me = reach.state.players[0] as PlayerState;
    expect(counterPowerOf(reach.state, me)).toBeGreaterThanOrEqual(
      getThreat(reach.state, "P2"),
    );
    expect(fearPlays(reach).length).toBeGreaterThan(0);
    for (const a of fearPlays(reach))
      expect(ruleOf(reach, (b) => b === a)).toContain(4);
    // `mxFearReach: false` (the paired check's control; `mxWhiteKeep` on): rule 4 casts Fear whenever it can.
    for (const a of fearPlays(reach))
      expect(
        mxPlanV2Verdict(reach.state, reach.legal, "P1", {
          fearReach: false,
        }).has(a),
      ).toBe(false);
    // No rank 5 strategy waiting: Fear as before.
    const plain = position({
      turn: 4,
      position: 4,
      hand: ["EBP04-081"],
      oppPosition: 4,
      zones: { 1: "EBP04-068", 2: "EBP04-068", 3: "EBP04-068" },
      oppZones: { 8: "EBP04-038" },
    });
    for (const a of fearPlays(plain)) expect(against(plain).has(a)).toBe(false);
  });
});
