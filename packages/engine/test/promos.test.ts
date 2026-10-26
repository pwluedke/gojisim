import { getAllCards } from "@gojisim/cards/test-decks";
import { getCardAbilities } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import {
  advance,
  advanceToDecision,
  getCounterPower,
  getLegalActions,
  getRank,
} from "../src";
import { checkInvariants } from "../src/invariants";
import { pass } from "./fixtures/ebp04";
import {
  activate,
  choose,
  godzilla,
  newLogTypes,
  opponentOf,
  play,
  self,
  settle,
  settleUntil,
  setup,
} from "./fixtures/play";
import {
  inDiscard,
  inHand,
  monster,
  onDeck,
  place,
  real,
  zoneCardIds,
} from "./fixtures/real";
import { battleCard, strategyCard } from "./fixtures/state";

// M12e: the promo cards (PR, EPR) in docs/abilities/m12-plan.md.

const ride = (overrides = {}) =>
  battleCard({ traits: ["Godzilla The Ride"], ...overrides });

/** A card's first print with this exact card number (PR-015 is a print of EPR-015, decision 417). */
const print = (cardNumber: string) => {
  const card = getAllCards().find((c) => c.cardNumber === cardNumber);
  if (!card) throw new Error(cardNumber);
  return card;
};

describe("PR vanilla monster cards", () => {
  it("PR-001 to PR-003 and PR-006 to PR-010 have no abilities: implemented, nothing to run", () => {
    for (const n of [
      "PR-001",
      "PR-002",
      "PR-003",
      "PR-006",
      "PR-007",
      "PR-008",
      "PR-009",
      "PR-010",
    ])
      expect(getCardAbilities(n)).toMatchObject({
        status: "implemented",
        abilities: [],
      });
  });
});

describe("EPR-005 Godzilla's Bite, PR-014: column destroy", () => {
  for (const number of ["EPR-005", "PR-014"])
    it(`${number} 4.4.5.4, 5.12: on activation it destroys every opponent battle card in your monster's column`, () => {
      const { state, me, opp } = setup(4);
      monster(state, me, godzilla(3), 4);
      // My zone 4 is in the same column as the opponent's zone 2 (4.4.5.4).
      place(state, opp, battleCard(), 2);
      place(state, opp, battleCard(), 7);
      const after = settle(
        activate(state, me, inHand(state, me, real(number))),
      );
      expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toEqual(["7"]);
      checkInvariants(after);
    });
});

describe("EPR-015 Godzilla (Godzilla the Ride: Great Clash)", () => {
  it("10.8: +5000 counter power while a Godzilla The Ride card is in your discard pile; PR-015 is the same card", () => {
    for (const number of ["EPR-015", "PR-015"]) {
      const { state, me } = setup(4);
      const card = place(state, me, print(number), 2);
      expect(getCounterPower(state, card), number).toBe(4000);
      inDiscard(state, me, ride());
      expect(getCounterPower(state, card), number).toBe(9000);
    }
  });
});

describe("EPR-016 KIJU Type 0 -G Breaker-", () => {
  const start = () => {
    const { state, me } = setup(4);
    me.hand = [];
    const kiju = place(state, me, real("EPR-016"), 2);
    const fodder = inHand(state, me, battleCard({ traits: ["Weapon"] }));
    return { state, me, kiju, fodder };
  };

  it("3.2, 10.5.4: at your counter phase you may place a Mech, Weapon or Ride battle card from your hand under it: +5000 counter power", () => {
    const { state, me } = start();
    const after = settleUntil(pass(state), "7.4.2");
    const mine = self(after, me);
    expect(mine.hand).toHaveLength(0);
    const stack = mine.zones[2][0];
    expect(stack).toHaveLength(2);
    expect(getCounterPower(after, stack!.at(-1)!)).toBe(13000);
  });

  it("T8: if it did, it is destroyed at the beginning of the end phase", () => {
    const { state, me } = start();
    const after = settleUntil(pass(state), "7.5.3");
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(newLogTypes(after, state)).toContain("destroy");
  });

  it("10.5.4: declining keeps it, with no bonus", () => {
    const { state, me } = start();
    // Step on to the counter phase's question and answer no to it.
    let after = advanceToDecision(pass(state));
    for (let i = 0; i < 50 && after.pendingChoice?.kind !== "confirm"; i++)
      after = advanceToDecision(
        after.pendingChoice
          ? choose(after, (id) => id !== "done")
          : advance(after),
      );
    expect(after.pendingChoice?.options[0]?.abilityId).toMatch(/^EPR-016#/);
    after = settleUntil(
      choose(after, (id) => id === "no"),
      "7.5.3",
    );
    expect(zoneCardIds(self(after, me))).toEqual({
      "2": [real("EPR-016").id],
    });
  });

  it("PR-016 is the same card: it has the same counter phase ability", () => {
    const { state, me } = setup(4);
    me.hand = [];
    place(state, me, print("PR-016"), 2);
    inHand(state, me, battleCard({ traits: ["Mech"] }));
    const after = settleUntil(pass(state), "7.4.2");
    expect(self(after, me).zones[2][0]).toHaveLength(2);
  });
});

describe("EPR-017 Godzilla (Godzilla the Ride: Great Clash)", () => {
  it("12.2, 3.2: [enter] places a Godzilla The Ride card from your discard pile under your monster card", () => {
    const { state, me } = setup(4);
    const mon = monster(state, me, godzilla(3), 4);
    const card = inDiscard(state, me, ride());
    const after = settle(
      play(state, me, inHand(state, me, real("EPR-017")), 2),
    );
    const mine = self(after, me);
    expect(mine.invadingMonsterZone.map((c) => c.cardId)).toEqual([
      card.cardId,
      mon.cardId,
    ]);
    expect(mine.discard.some((c) => c.cardId === card.cardId)).toBe(false);
  });
});

describe("EPR-018 Godzilla the Ride: Great Clash", () => {
  it("10.5.4, 5.8: discards 1, then searches for up to 1 Mech, Weapon or Ride battle card", () => {
    const { state, me } = setup(6);
    me.hand = [];
    const target = onDeck(state, me, ride());
    inHand(state, me, battleCard());
    const card = inHand(state, me, real("EPR-018"));
    const after = settle(activate(state, me, card));
    const mine = self(after, me);
    expect(mine.hand.map((c) => c.cardId)).toEqual([target.cardId]);
    expect(newLogTypes(after, state)).toEqual(
      expect.arrayContaining(["discard", "search", "addToHand"]),
    );
  });

  it("10.5.4.1: with nothing left to discard, it does nothing", () => {
    const { state, me } = setup(6);
    me.hand = [];
    onDeck(state, me, ride());
    const card = inHand(state, me, real("EPR-018"));
    const after = settle(activate(state, me, card));
    expect(self(after, me).hand).toHaveLength(0);
    expect(newLogTypes(after, state)).toContain("costNotPaid");
  });
});

describe("EPR-019 Gravity Beam", () => {
  it("8.3.1, M2: with a Fest King Ghidorah battle card in your zones it plays as rank 4 from zone 4", () => {
    const { state, me } = setup(4);
    const beam = inHand(state, me, real("EPR-019"));
    const offered = () =>
      getLegalActions(state, me.id).some(
        (a) =>
          a.type === "activateStrategy" && a.cardInstanceId === beam.instanceId,
      );
    expect(getRank(state, beam)).toBe(7);
    expect(offered()).toBe(false);
    place(state, me, battleCard({ traits: ["Fest"] }), 2);
    expect(offered()).toBe(false);
    place(state, me, battleCard({ traits: ["Fest", "King Ghidorah"] }), 3);
    expect(offered()).toBe(true);
  });

  it("5.7.2: the opponent discards down to 3", () => {
    const { state, me, opp } = setup(7);
    for (let i = 0; i < 4; i++) inHand(state, opp, strategyCard());
    const after = settle(
      activate(state, me, inHand(state, me, real("EPR-019"))),
    );
    expect(opponentOf(after, me).hand).toHaveLength(3);
  });
});
