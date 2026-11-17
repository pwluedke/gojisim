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
import { blunderAllowed, ISMCTS_DEFAULTS, withPrunes } from "./ismcts";
import type { Decklist } from "./types";
import { DESPAIR, GAM } from "./wranglerPlan";
import {
  GODZILLA_1954_WIPE,
  KING,
  LANDING,
  SLITHERING,
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

  it("#317 (v2.1): a push (Godzilla Landing) is argued against unless a follow-up comes this turn: the counter, or a rank 7-8 battle card; trampling alone isn't one", () => {
    // v2.2's rule (`v23: false`); v2.3 takes the counter alone as a follow-up (test below).
    const landings = (state: GameState, p1: PlayerState, v23 = false) => {
      const legal = getLegalActions(state, "P1");
      const found = legal.filter(
        (a) =>
          a.type === "activateStrategy" && ofCard(state, p1, a) === LANDING,
      );
      expect(found.length).toBeGreaterThan(0);
      const { against } = wranglerV2Verdict(
        state,
        legal,
        "P1",
        WRANGLER,
        undefined,
        { v23: v23 },
      );
      return found.map((a) => against.has(a));
    };
    // Nothing after it: argued against.
    const plain = position([LANDING], 4, 2);
    for (const a of landings(plain.state, plain.p1)) expect(a).toBe(true);
    // Their own battle card in zone 3: the push makes them trample it, but nothing follows.
    const trample = position([LANDING], 4, 2);
    trample.p2.zones[3] = [[add(trample.state, real("ESD02-012"), "P2")]];
    for (const a of landings(trample.state, trample.p1)) expect(a).toBe(true);
    // Their monster in zone 7: the push takes it to zone 8, where the rank 8 King can be played
    // (8.2.1). Without the King in hand, the same push is argued against.
    const king = position([LANDING, KING], 4, 7);
    for (const a of landings(king.state, king.p1)) expect(a).toBe(false);
    // v2.3 (Ian): a rank 7-8 play after the push isn't a follow-up any more, only the counter.
    for (const a of landings(king.state, king.p1, true)) expect(a).toBe(true);
    const noKing = position([LANDING], 4, 7);
    for (const a of landings(noKing.state, noKing.p1)) expect(a).toBe(true);
    // `v21: false` (the paired check's control) is v2: the trample alone allows it.
    const legalT = getLegalActions(trample.state, "P1");
    const v2 = wranglerV2Verdict(
      trample.state,
      legalT,
      "P1",
      WRANGLER,
      undefined,
      { v21: false },
    );
    for (const a of legalT)
      if (
        a.type === "activateStrategy" &&
        ofCard(trample.state, trample.p1, a) === LANDING
      )
        expect(v2.against.has(a)).toBe(false);
  });

  it("#381 (Ian's record e09f7ade move 14): an invasion that reaches The Slithering Disaster's zone, then the push and two battle cards make the counter this turn, is taken over raging; paid with the card the counter needs, or with no counter after, it isn't", () => {
    const setUp = (gams: number) => {
      const pos = position(
        [SLITHERING, GODZILLA_1954_WIPE, ...Array(gams).fill(GAM)],
        4,
        4,
        7,
      );
      // Their rage: a threat one GAM (10,000) can't counter and two can.
      pos.p2.rage = 2;
      // GAM can be played with 8+ monster cards in the discard pile.
      pos.p1.discard = Array.from({ length: 8 }, () =>
        add(pos.state, real("EBP01-002"), "P1"),
      );
      return pos;
    };
    const judge = (gams: number, pushLine = true) => {
      const { state, p1 } = setUp(gams);
      const legal = getLegalActions(state, "P1");
      const { against } = wranglerV2Verdict(
        state,
        legal,
        "P1",
        WRANGLER,
        undefined,
        { bioHard: false, pushLine: pushLine },
      );
      const invade = (n: string) =>
        legal.filter((a) => a.type === "invade" && ofCard(state, p1, a) === n);
      return {
        payWipe: invade(GODZILLA_1954_WIPE).map((a) => against.has(a)),
        payGam: invade(GAM).map((a) => against.has(a)),
        rage: legal
          .filter((a) => a.type === "gainRage")
          .map((a) => against.has(a)),
      };
    };
    const line = judge(2);
    expect(line.payWipe.length).toBeGreaterThan(0);
    for (const d of line.payWipe) expect(d).toBe(false);
    for (const d of line.rage) expect(d).toBe(true);
    // Paying with a GAM leaves one: not enough for the counter, so that invasion still waits.
    for (const d of line.payGam) expect(d).toBe(true);
    // One GAM in hand: no counter after the push, no line; don't race again.
    const short = judge(1);
    for (const d of short.payWipe) expect(d).toBe(true);
    // `wranglerPushLine: false` (the paired check's control).
    const off = judge(2, false);
    for (const d of off.payWipe) expect(d).toBe(true);
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

  it("churn from turn 1: rage discards over passing, but the held Godzilla (1954) EBP01-004 stays until a King is out (v2.2; v2.3 pitches it too)", () => {
    const { state, p1 } = position(["EBP01-002", GODZILLA_1954_WIPE], 1, 1, 1);
    const legal = getLegalActions(state, "P1");
    const { against, rescued } = wranglerV2Verdict(
      state,
      legal,
      "P1",
      WRANGLER,
      undefined,
      { v23: false },
    );
    // v2.3 (Ian): every monster card but Godzilla (2004) is pitched, Godzilla (1954) EBP01-004 too.
    const v23 = wranglerV2Verdict(state, legal, "P1", WRANGLER);
    for (const a of legal)
      if (a.type === "gainRage") expect(v23.rescued.has(a)).toBe(true);
    for (const a of legal) {
      if (a.type === "pass") expect(against.has(a)).toBe(true);
      if (a.type === "gainRage") {
        const n = ofCard(state, p1, a);
        expect(rescued.has(a)).toBe(n !== GODZILLA_1954_WIPE);
      }
    }
  });

  it("#316 (v2.1): with a King in zones 1-5 under 3 rage, passing is argued against while a rage discard is left, a held card's too", () => {
    // Only the held Godzilla (2004) EBP01-008 to discard: v2 let the bot pass at 2 rage.
    const { state, p1 } = position(["EBP01-008"], 3, 2);
    p1.zones[1] = [[add(state, real(KING), "P1")]];
    p1.rage = 2;
    const legal = getLegalActions(state, "P1");
    const rage = legal.filter((a) => a.type === "gainRage");
    expect(rage.length).toBeGreaterThan(0);
    const { against, rescued } = wranglerV2Verdict(
      state,
      legal,
      "P1",
      WRANGLER,
    );
    for (const a of legal)
      if (a.type === "pass") expect(against.has(a)).toBe(true);
    for (const a of rage) {
      expect(against.has(a)).toBe(false);
      expect(rescued.has(a)).toBe(true);
    }
    // At 3 rage the King is protected: passing is fine.
    p1.rage = 3;
    const done = wranglerV2Verdict(state, legal, "P1", WRANGLER);
    for (const a of legal)
      if (a.type === "pass") expect(done.against.has(a)).toBe(false);
  });

  it("#321 (v2.1): discarding down (5.7.2), a spare monster card goes, not Godzilla Landing or another key card", () => {
    const { state, p1 } = position([LANDING, KING, "EBP01-002"], 3, 2);
    const options = p1.hand.map((c) => ({
      id: c.instanceId,
      cardId: c.cardId,
      abilityId: null,
    }));
    state.pendingChoice = {
      id: 99,
      player: "P1",
      kind: "target",
      rule: "5.7.2",
      options,
      private: true,
    };
    const picks: Action[] = options.map((o) => ({
      type: "choose",
      player: "P1",
      choiceId: 99,
      optionId: o.id,
    }));
    const { against } = wranglerV2Verdict(state, picks, "P1", WRANGLER);
    const of = (a: Action) =>
      a.type === "choose"
        ? state.cards[options.find((o) => o.id === a.optionId)!.cardId]
            ?.deckCardNumber
        : undefined;
    for (const a of picks)
      expect(against.has(a)).toBe(of(a) === LANDING || of(a) === KING);
    // With no spare monster card, nothing is argued against (one of them has to go).
    const keys = picks.filter((a) => of(a) !== "EBP01-002");
    const none = wranglerV2Verdict(state, keys, "P1", WRANGLER);
    for (const a of keys) expect(none.against.has(a)).toBe(false);
  });

  it("#318 (v2.2): with no battle card in hand, dig: Despair even for no value over passing (the end phase draws up to the hand size, 7.5.4); the held cards stay", () => {
    // Despair (no Mecha-King to hit) and the held Godzilla (2004) EBP01-008: v2.1 lets the bot pass.
    const { state, p1 } = position([DESPAIR, "EBP01-008"], 3, 2);
    const legal = getLegalActions(state, "P1");
    const despair = legal.filter(
      (a) => a.type === "activateStrategy" && ofCard(state, p1, a) === DESPAIR,
    );
    expect(despair.length).toBeGreaterThan(0);
    const dig = wranglerV2Verdict(state, legal, "P1", WRANGLER);
    for (const a of legal)
      if (a.type === "pass") expect(dig.against.has(a)).toBe(true);
    for (const a of despair) expect(dig.rescued.has(a)).toBe(true);
    // The held card isn't raged away for it.
    for (const a of legal)
      if (a.type === "gainRage") expect(dig.rescued.has(a)).toBe(false);
    // v2.1 (`v22: false`): passing stays.
    const v21 = wranglerV2Verdict(state, legal, "P1", WRANGLER, undefined, {
      v22: false,
    });
    for (const a of legal)
      if (a.type === "pass") expect(v21.against.has(a)).toBe(false);
    // With a battle card in hand (an answer), no dig.
    p1.hand.push(add(state, real(KING), "P1"));
    const held = getLegalActions(state, "P1");
    const answer = wranglerV2Verdict(state, held, "P1", WRANGLER);
    for (const a of held)
      if (a.type === "pass") expect(answer.against.has(a)).toBe(false);
  });

  it("v2.2 (Ian's notes, point 7): at Despair's target pick, a battle card in your monster's column goes before others in reach", () => {
    const { state, p1, p2 } = position([DESPAIR], 3, 2);
    p1.rage = 2;
    // Your monster in zone 3: their zone 3 is in its column, their zone 1 isn't (no Mecha-King).
    const aligned = add(state, real("ESD02-012"), "P2");
    const other = add(state, real("ESD02-012"), "P2");
    p2.zones[3] = [[aligned]];
    p2.zones[1] = [[other]];
    const despair = getLegalActions(state, "P1").find(
      (a) => a.type === "activateStrategy" && ofCard(state, p1, a) === DESPAIR,
    )!;
    const pick = advanceToDecision(applyAction(state, despair));
    expect(pick.pendingChoice?.kind).toBe("target");
    const legal = getLegalActions(pick, "P1");
    const option = (id: string) =>
      legal.find((a) => a.type === "choose" && a.optionId === id)!;
    expect(option(aligned.instanceId)).toBeDefined();
    expect(option(other.instanceId)).toBeDefined();
    const { against } = wranglerV2Verdict(pick, legal, "P1", WRANGLER);
    expect(against.has(option(aligned.instanceId))).toBe(false);
    expect(against.has(option(other.instanceId))).toBe(true);
    // v2.1 (`v22: false`): no preference.
    const v21 = wranglerV2Verdict(pick, legal, "P1", WRANGLER, undefined, {
      v22: false,
    });
    expect(v21.against.has(option(other.instanceId))).toBe(false);
  });

  it("v2.2 (Ian, point 2): with Godzilla (2023) ESD01-002 on top and a King short of 3 rage, an invasion for its fetch, paying with a strategy it doesn't need, isn't argued against; paying with a key card still is", () => {
    const { state, p1 } = position([SLITHERING, LANDING], 3, 2);
    p1.invadingMonsterZone = [add(state, real("ESD01-002"), "P1")];
    p1.zones[1] = [[add(state, real(KING), "P1")]];
    p1.rage = 0;
    const legal = getLegalActions(state, "P1");
    const invade = (n: string) =>
      legal.filter((a) => a.type === "invade" && ofCard(state, p1, a) === n);
    expect(invade(SLITHERING).length).toBeGreaterThan(0);
    expect(invade(LANDING).length).toBeGreaterThan(0);
    const { against } = wranglerV2Verdict(state, legal, "P1", WRANGLER);
    for (const a of invade(SLITHERING)) expect(against.has(a)).toBe(false);
    for (const a of invade(LANDING)) expect(against.has(a)).toBe(true);
    // v2.1 (`v22: false`): don't race, so both are argued against.
    const v21 = wranglerV2Verdict(state, legal, "P1", WRANGLER, undefined, {
      v22: false,
    });
    for (const a of invade(SLITHERING)) expect(v21.against.has(a)).toBe(true);
  });

  it("v2.2 (Ian, point 10): Godzilla Against Mechagodzilla's rage reset is saved when it doesn't make the counter", () => {
    const { state, p1 } = position([LANDING], 3, 2);
    p1.zones[1] = [[add(state, real(GAM), "P1")]];
    for (let i = 0; i < 8; i++)
      p1.discard.push(add(state, real("EBP01-002"), "P1"));
    const invade = getLegalActions(state, "P1").find(
      (a) => a.type === "invade",
    )!;
    let s = advanceToDecision(applyAction(state, invade));
    // Answer any of the bot's own picks before GAM's (first option).
    for (let i = 0; i < 5 && s.pendingChoice?.kind !== "confirm"; i++) {
      const next = getLegalActions(s, "P1").find((a) => a.type === "choose");
      if (!next) break;
      s = advanceToDecision(applyAction(s, next));
    }
    expect(s.pendingChoice?.kind).toBe("confirm");
    const legal = getLegalActions(s, "P1");
    const yes = legal.find((a) => a.type === "choose" && a.optionId === "yes")!;
    const { against } = wranglerV2Verdict(s, legal, "P1", WRANGLER);
    expect(against.has(yes)).toBe(true);
  });

  it("#380 (Ian's record 40b04608 move 59): with GAM in hand but not playable and no counter this turn, a Landing that lets GAM go out of their reach goes before raging; GAM goes out of the column of their monster's zone and its next (4.4.5.4)", () => {
    // Their monster in zone 6: GAM (rank 7) can't be played until a push takes it to zone 7.
    const setUp = (oppAt: ZoneNumber) => {
      const pos = position([LANDING, GAM, "EBP01-002"], 3, oppAt, 14);
      pos.p1.discard = Array.from({ length: 10 }, () =>
        add(pos.state, real("EBP01-002"), "P1"),
      );
      // Their rage: a threat no play counters this turn.
      pos.p2.rage = 2;
      return pos;
    };
    const judge = (gamSetup: boolean) => {
      const { state, p1 } = setUp(6);
      const legal = getLegalActions(state, "P1");
      expect(
        legal.some(
          (a) => a.type === "playBattle" && ofCard(state, p1, a) === GAM,
        ),
      ).toBe(false);
      const v = wranglerV2Verdict(state, legal, "P1", WRANGLER, undefined, {
        gamSetup,
      });
      return {
        landing: legal
          .filter(
            (a) =>
              a.type === "activateStrategy" && ofCard(state, p1, a) === LANDING,
          )
          .map((a) => v.against.has(a)),
        rage: legal
          .filter((a) => a.type === "gainRage")
          .map((a) => v.against.has(a)),
        pass: legal
          .filter((a) => a.type === "pass")
          .map((a) => v.against.has(a)),
      };
    };
    const on = judge(true);
    expect(on.landing.length).toBeGreaterThan(0);
    for (const d of on.landing) expect(d).toBe(false);
    for (const d of [...on.rage, ...on.pass]) expect(d).toBe(true);
    // `wranglerGamSetup: false` (the paired check's control): no counter after it, so the
    // Landing waits (#317).
    const off = judge(false);
    for (const d of off.landing) expect(d).toBe(true);

    // Their monster in zone 7: their zones 7 and 8 share columns with your zones 2, 3 and 8, so GAM
    // goes in zone 1, and down before passing.
    // (#424's wider reach, the zone a counter sends their monster back to, is off here: its own
    // test covers it.)
    const place = (gamSetup: boolean) => {
      const { state, p1 } = setUp(7);
      const legal = getLegalActions(state, "P1");
      const v = wranglerV2Verdict(state, legal, "P1", WRANGLER, undefined, {
        gamSetup,
        gamReach: false,
      });
      const gam = legal.filter(
        (a): a is Extract<Action, { type: "playBattle" }> =>
          a.type === "playBattle" && ofCard(state, p1, a) === GAM,
      );
      return {
        zones: Object.fromEntries(gam.map((a) => [a.zone, !v.against.has(a)])),
        pass: legal
          .filter((a) => a.type === "pass")
          .map((a) => v.against.has(a)),
      };
    };
    const safe = place(true);
    expect(safe.zones[1]).toBe(true);
    expect(safe.zones[2]).toBe(false);
    expect(safe.zones[8]).toBe(false);
    for (const d of safe.pass) expect(d).toBe(true);
    const plain = place(false);
    expect(plain.zones[1]).toBe(true);
    expect(plain.zones[2]).toBe(true);
    expect(plain.zones[8]).toBe(true);
  });

  it("#424 (Ian's record 5ac1295d move 77): GAM never goes where their monster can destroy it next turn (the zone a counter sends it back to, 5.15.1.1, counts) while a zone out of reach is open", () => {
    const judge = (gamReach: boolean) => {
      const { state, p1 } = position([GAM], 3, 7, 16);
      p1.discard = Array.from({ length: 10 }, () =>
        add(state, real("EBP01-002"), "P1"),
      );
      const legal = getLegalActions(state, "P1");
      const v = wranglerV2Verdict(state, legal, "P1", WRANGLER, undefined, {
        gamReach,
      });
      const at = (zone: number) =>
        legal.find(
          (a) =>
            a.type === "playBattle" &&
            a.zone === zone &&
            ofCard(state, p1, a) === GAM,
        )!;
      return (zone: number) => v.pruned?.has(at(zone)) ?? false;
    };
    const on = judge(true);
    // Their monster in zone 7 (a counter sends it back to zone 4): their zones 7, 8, 4 and 5 share
    // columns with your zones 1, 2, 3 and 8. Zones 6 and 7 are out of reach.
    for (const z of [1, 2, 8]) expect(on(z)).toBe(true);
    for (const z of [6, 7]) expect(on(z)).toBe(false);
    // `wranglerGamReach: false` (the control): nothing pruned for it.
    const off = judge(false);
    for (const z of [1, 2, 6, 7, 8]) expect(off(z)).toBe(false);
  });

  it("v2.3 (Ian): against Monster X, with fewer than 2 battle cards in hand, dig (Despair over passing)", () => {
    const { state, p1, p2 } = position([KING, DESPAIR], 3, 2);
    p2.invadingMonsterZone = [add(state, real("EBP04-032"), "P2")];
    const legal = getLegalActions(state, "P1");
    const despair = legal.filter(
      (a) => a.type === "activateStrategy" && ofCard(state, p1, a) === DESPAIR,
    );
    expect(despair.length).toBeGreaterThan(0);
    const dig = wranglerV2Verdict(state, legal, "P1", WRANGLER);
    for (const a of legal)
      if (a.type === "pass") expect(dig.against.has(a)).toBe(true);
    for (const a of despair) expect(dig.rescued.has(a)).toBe(true);
    // v2.2 (`v23: false`): one battle card is an answer; passing stays.
    const v22 = wranglerV2Verdict(state, legal, "P1", WRANGLER, undefined, {
      v23: false,
    });
    for (const a of legal)
      if (a.type === "pass") expect(v22.against.has(a)).toBe(false);
  });

  /** A Biollante list for `theirs` (the opponent's public list): its monster deck is all it needs. */
  const BIOLLANTE = {
    monsterDeck: ["EBP02-024", "EBP02-025", "EBP02-027", "EBP02-029"].map(real),
    mainDeck: [],
  } as unknown as Decklist;
  const verdict = (state: GameState, legal: Action[], bio: boolean) =>
    wranglerV2Verdict(state, legal, "P1", WRANGLER, BIOLLANTE, { bio: bio });

  it("wranglerBio (Ian): Biollante stays at rank I: no King play that makes the counter on its Rose Form", () => {
    const { state, p1, p2 } = position([], 3, 5);
    // Rank 1, so it can be played with their monster in zone 5 (8.2.1).
    p1.hand = [add(state, { ...real(KING), rank: 1 }, "P1")];
    p2.invadingMonsterZone = [add(state, real("EBP02-024"), "P2")];
    p1.rage = 10;
    const legal = getLegalActions(state, "P1");
    const kingAt1 = legal.filter(
      (a) =>
        a.type === "playBattle" &&
        ofCard(state, p1, a) === KING &&
        a.zone === 1,
    );
    expect(kingAt1.length).toBeGreaterThan(0);
    for (const a of kingAt1)
      expect(verdict(state, legal, true).against.has(a)).toBe(true);
    for (const a of kingAt1)
      expect(verdict(state, legal, false).against.has(a)).toBe(false);
  });

  it("wranglerBio (Ian): Kings spread, never next to each other, where one Godzilla vs. Megaguirus takes both", () => {
    const { state, p1, p2 } = position([], 3, 5);
    // The King in zone 1 first: cards are stored by id, so the rank 1 copy in hand goes last.
    p1.zones[1] = [[add(state, real(KING), "P1")]];
    p1.hand = [add(state, { ...real(KING), rank: 1 }, "P1")];
    p2.invadingMonsterZone = [add(state, real("EBP02-026"), "P2")];
    const legal = getLegalActions(state, "P1");
    const king = (zone: number) =>
      legal.filter(
        (a) =>
          a.type === "playBattle" &&
          ofCard(state, p1, a) === KING &&
          a.zone === zone,
      );
    expect(king(2).length).toBeGreaterThan(0);
    expect(king(8).length).toBeGreaterThan(0);
    for (const a of king(2))
      expect(verdict(state, legal, true).against.has(a)).toBe(true);
    for (const a of king(8))
      expect(verdict(state, legal, true).against.has(a)).toBe(false);
    for (const a of king(2))
      expect(verdict(state, legal, false).against.has(a)).toBe(false);
  });

  it("wranglerBio (Ian): no strategy played against its rank III EBP02-027 in zone 5 or beyond (awakening 6: counter-proof while you have one)", () => {
    const { state, p1, p2 } = position([DESPAIR], 3, 5);
    p2.invadingMonsterZone = [add(state, real("EBP02-027"), "P2")];
    p1.rage = 2;
    const legal = getLegalActions(state, "P1");
    const despair = legal.filter(
      (a) => a.type === "activateStrategy" && ofCard(state, p1, a) === DESPAIR,
    );
    expect(despair.length).toBeGreaterThan(0);
    for (const a of despair)
      expect(verdict(state, legal, true).against.has(a)).toBe(true);
    for (const a of despair)
      expect(verdict(state, legal, false).against.has(a)).toBe(false);
  });

  it("wranglerBioHard (Paul): the Rose Form counter and the strategy vs rank III EBP02-027 are prunes, the search's and a blunder's; the Kings spread stays an argument", () => {
    const hardVerdict = (state: GameState, legal: Action[], bioHard: boolean) =>
      wranglerV2Verdict(state, legal, "P1", WRANGLER, BIOLLANTE, {
        bioHard: bioHard,
      }).pruned ?? new Set<Action>();
    // Rose Form: the King play that makes the counter is pruned.
    const rose = position([], 3, 5);
    rose.p1.hand = [add(rose.state, { ...real(KING), rank: 1 }, "P1")];
    rose.p2.invadingMonsterZone = [add(rose.state, real("EBP02-024"), "P2")];
    rose.p1.rage = 10;
    const roseLegal = getLegalActions(rose.state, "P1");
    const kingAt1 = roseLegal.filter(
      (a) =>
        a.type === "playBattle" &&
        ofCard(rose.state, rose.p1, a) === KING &&
        a.zone === 1,
    );
    expect(kingAt1.length).toBeGreaterThan(0);
    for (const a of kingAt1)
      expect(hardVerdict(rose.state, roseLegal, true).has(a)).toBe(true);
    // `wranglerBioHard: false` (the paired check's control): an argument only.
    for (const a of kingAt1)
      expect(hardVerdict(rose.state, roseLegal, false).has(a)).toBe(false);
    // Rank III EBP02-027 in zone 5 (an advance reaches 6): no strategy, nor in a blunder.
    const iii = position([DESPAIR], 3, 5);
    iii.p2.invadingMonsterZone = [add(iii.state, real("EBP02-027"), "P2")];
    iii.p1.rage = 2;
    const iiiLegal = getLegalActions(iii.state, "P1");
    const despair = iiiLegal.filter(
      (a) =>
        a.type === "activateStrategy" &&
        ofCard(iii.state, iii.p1, a) === DESPAIR,
    );
    expect(despair.length).toBeGreaterThan(0);
    for (const a of despair)
      expect(hardVerdict(iii.state, iiiLegal, true).has(a)).toBe(true);
    const blunder = (bioHard: number) =>
      blunderAllowed(
        iii.state,
        iiiLegal,
        "P1",
        // Card rule 22 (`targetCheck`) would also leave out a Despair with nothing to destroy;
        // off here, so only `wranglerBioHard` decides.
        {
          ...ISMCTS_DEFAULTS,
          cardRules: 1,
          targetCheck: 0,
          wranglerBioHard: bioHard,
        },
        WRANGLER,
      );
    for (const a of despair) expect(blunder(1).includes(a)).toBe(false);
    expect(despair.some((a) => blunder(0).includes(a))).toBe(true);
    // The Kings spread (another wranglerBio rule) isn't pruned.
    const spread = position([], 3, 5);
    spread.p1.zones[1] = [[add(spread.state, real(KING), "P1")]];
    spread.p1.hand = [add(spread.state, { ...real(KING), rank: 1 }, "P1")];
    spread.p2.invadingMonsterZone = [
      add(spread.state, real("EBP02-026"), "P2"),
    ];
    const spreadLegal = getLegalActions(spread.state, "P1");
    const pruned = hardVerdict(spread.state, spreadLegal, true);
    for (const a of spreadLegal)
      if (a.type === "playBattle") expect(pruned.has(a)).toBe(false);
  });

  it("wranglerBioHard: its prunes outrank the softer rules; with only a pruned move and a ruled-out pass left, the pass comes back (the check's record: Slithering Disaster vs Rose Form in zone 5)", () => {
    const push = {
      type: "activateStrategy",
      player: "P1",
      cardInstanceId: "c1",
      strategyZone: 1,
    } as Action;
    const pass = { type: "pass", player: "P1" } as Action;
    const play = {
      type: "playBattle",
      player: "P1",
      cardInstanceId: "c2",
      zone: 1,
    } as Action;
    const keyOf = (a: Action) => JSON.stringify(a);
    // Pass ruled out by another rule, the push pruned: pass comes back, the push is dead.
    const dead = new Set([keyOf(pass)]);
    expect(withPrunes([push, pass], new Set([push]), dead, keyOf)).toBe(pass);
    expect(dead.has(keyOf(push))).toBe(true);
    expect(dead.has(keyOf(pass))).toBe(false);
    // Another live move: nothing comes back, and the push is pruned.
    const dead2 = new Set([keyOf(pass)]);
    expect(withPrunes([push, pass, play], new Set([push]), dead2, keyOf)).toBe(
      undefined,
    );
    expect(dead2.has(keyOf(push))).toBe(true);
    expect(dead2.has(keyOf(pass))).toBe(true);
    // No pass at all (a choice): nothing is pruned.
    const dead3 = new Set<string>();
    withPrunes([push], new Set([push]), dead3, keyOf);
    expect(dead3.size).toBe(0);
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
