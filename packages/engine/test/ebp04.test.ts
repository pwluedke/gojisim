import { type Card, getCardAbilities } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import { counterPowerOf, getLegalActions, getThreat } from "../src";
import {
  destroyWith,
  green,
  handOf,
  inStrategy,
  pass,
  strategyIds,
  useFixtures,
} from "./fixtures/ebp04";
import {
  choose,
  godzilla,
  invade,
  invader,
  newLogTypes,
  opponentOf,
  opponentsTurn,
  playMonster,
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
import {
  addCard,
  battleCard,
  monsterCard,
  strategyCard,
} from "./fixtures/state";

// M12d-1: EBP04 monster cards (docs/abilities/m12-plan.md), with pieces built in M12a to M12c
// plus small extensions. One test (or more) per ability, named with its rules.

useFixtures();

const rank1 = () => strategyCard({ rank: 1 });

describe("EBP04 keywords (12.5, 12.6)", () => {
  it.each([
    ["EBP04-003", 2],
    ["EBP04-007", 3],
    ["EBP04-008", 2],
  ] as const)("%s 12.5.1: Burst rank %i (Q15)", (number, rank) => {
    expect(getCardAbilities(number).abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "burst", rank },
    });
  });

  it("EBP04-047 12.6.1: Evolution rank 8, trait Kaizer Ghidorah", () => {
    expect(getCardAbilities("EBP04-047").abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "evolution", rank: 8, trait: "Kaizer Ghidorah" },
    });
  });

  it("EBP04-059 6.1.1.4: any number of copies (Q13)", () => {
    expect(getCardAbilities("EBP04-059").deckRules).toEqual([
      { rule: "anyNumber" },
    ]);
  });
});

describe("EBP04 Godzilla (2004), red", () => {
  it("EBP04-001 7.4.1, 4.4.5.4: on the opponent's turn, with no opponent battle card in its column, +1 rage at the counter phase", () => {
    const run = (blocked: boolean) => {
      const { state, me, opp } = opponentsTurn();
      monster(state, me, real("EBP04-001"), 3);
      me.rage = 0;
      // My zone 3's column: the opponent's zones 3 and 8 (4.4.5.4).
      if (blocked) place(state, opp, battleCard(), 8);
      return self(settleUntil(pass(state), "7.4.2"), me).rage;
    };
    expect(run(false)).toBe(1);
    expect(run(true)).toBe(0);
  });

  it("EBP04-002 5.12, 5.7.2: when an opponent's battle card in its column is destroyed, with a rank 1 strategy card, the opponent discards down to 2", () => {
    const run = (zone: 1 | 3) => {
      const { state, me, opp } = setup(3);
      monster(state, me, real("EBP04-002"), 3);
      inStrategy(state, me, rank1());
      const target = place(state, opp, battleCard(), zone);
      handOf(state, opp, 5);
      return opponentOf(destroyWith(state, me, target.instanceId), me).hand
        .length;
    };
    expect(run(3)).toBe(2);
    expect(run(1)).toBe(5); // zone 1 is not in my zone 3's column
  });

  it("EBP04-003 12.2, 5.12: on enter with a rank 1 strategy card, destroys 1 of the opponent's rank 6 or lower battle cards", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, godzilla(3), 3);
    inStrategy(state, me, rank1());
    place(state, opp, battleCard({ rank: 6 }), 1);
    place(state, opp, battleCard({ id: 964031, rank: 7 }), 2);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-003"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "2": [964031] });
  });

  it("EBP04-004 12.2: on enter with a rank 1 strategy card, +2 rage", () => {
    const { state, me } = setup(3);
    monster(state, me, godzilla(3), 3);
    me.rage = 0;
    inStrategy(state, me, rank1());
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-004"))),
    );
    expect(self(after, me).rage).toBe(3); // +1 for the monster play (8.5.1.1)
  });

  it("EBP04-005 5.8, 5.9: on enter with 1 or fewer strategy cards, puts a rank 1 strategy card from the deck into play and activates it", () => {
    const { state, me } = setup(3);
    monster(state, me, godzilla(4), 3);
    onDeck(state, me, strategyCard({ id: 964051, rank: 1 }));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-005"))),
    );
    expect(strategyIds(self(after, me))).toEqual([964051]);
  });

  it("EBP04-005 10.6.4.1.2, 10.10: when an opponent's battle card in its column is destroyed, with 3 rank 1 strategy cards in the discard pile, destroys their battle cards in its column up to that card's rank", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP04-005"), 3);
    opp.monsterPosition = 6; // not in zone 8, where it would crush the card there (11.3)
    for (let i = 0; i < 3; i++) inDiscard(state, me, rank1());
    const target = place(state, opp, battleCard({ rank: 5 }), 3);
    place(state, opp, battleCard({ rank: 4 }), 8); // in the column, rank 4: destroyed
    place(state, opp, battleCard({ id: 964052, rank: 4 }), 1); // not in the column
    const after = destroyWith(state, me, target.instanceId);
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "1": [964052] });
  });

  it("EBP04-006 5.16.1: on the opponent's turn, with 3 rank 1 strategy cards in the discard pile, their rank 5 or lower battle cards can't engage", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP04-006"), 4);
    for (let i = 0; i < 3; i++) inDiscard(state, me, rank1());
    place(state, opp, battleCard({ rank: 5, counterOrThreat: 20000 }), 1);
    place(state, opp, battleCard({ rank: 6, counterOrThreat: 3000 }), 2);
    expect(counterPowerOf(state, opp)).toBe(3000);
    me.discard = [];
    expect(counterPowerOf(state, opp)).toBe(23000);
  });

  it("EBP04-007 8.6.3, E15: an invasion with an [invade-1] card advances 2 zones; with [invade-2], 2 as usual", () => {
    const run = (icon: number) => {
      const { state, me } = setup(2);
      monster(state, me, real("EBP04-007"), 2);
      return self(settle(invade(state, me, invader(state, me, icon))), me)
        .monsterPosition;
    };
    expect(run(1)).toBe(4);
    expect(run(2)).toBe(4);
  });

  it("EBP04-008 12.4, 5.7.2: in zone 8, at the beginning of your counter phase the opponent discards down to 3", () => {
    const run = (zone: 7 | 8) => {
      const { state, me, opp } = setup(zone);
      monster(state, me, real("EBP04-008"), zone);
      handOf(state, opp, 5);
      return opponentOf(settleUntil(pass(state), "7.4.2"), me).hand.length;
    };
    expect(run(8)).toBe(3);
    expect(run(7)).toBe(5);
  });

  it("EBP04-009 10.5.4, 4.4.5.4: on the opponent's turn you may discard a strategy card to destroy their rank 6 or lower battle cards in its column", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP04-009"), 3);
    me.hand = [];
    inHand(state, me, strategyCard());
    place(state, opp, battleCard({ rank: 6 }), 3);
    place(state, opp, battleCard({ id: 964091, rank: 7 }), 8);
    place(state, opp, battleCard({ id: 964092, rank: 6 }), 1);
    const after = settleUntil(pass(state), "7.4.2");
    expect(zoneCardIds(opponentOf(after, me))).toEqual({
      "1": [964092],
      "8": [964091],
    });
    expect(self(after, me).hand).toEqual([]);
  });
});

describe("EBP04 Multi-purpose Fighting System-3 and blue Godzilla", () => {
  it("EBP04-011 10.8.1: +10,000 threat with a red and a blue battle card in your zones", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP04-011"), 3);
    me.rage = 0;
    place(state, me, battleCard({ colors: ["Red"] }), 1);
    expect(getThreat(state, me.id)).toBe(37000);
    place(state, me, battleCard({ colors: ["Blue"] }), 2);
    expect(getThreat(state, me.id)).toBe(47000);
  });

  it("EBP04-013 5.7.3, C3, 5.13.2: with 5 monster cards in the discard pile, mills 3, destroys the opponent's battle cards in zones numbered like their ranks and retreats their monster there", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, godzilla(3, ["Blue"]), 3);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    opp.monsterPosition = 4;
    for (const card of [
      battleCard({ rank: 2 }),
      strategyCard({ rank: 4 }),
      battleCard({ rank: 7 }),
    ].reverse())
      onDeck(state, me, card);
    place(state, opp, battleCard(), 2);
    place(state, opp, battleCard({ id: 964131 }), 6);
    place(state, opp, battleCard(), 7);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-013"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "6": [964131] });
    expect(opponentOf(after, me).monsterPosition).toBe(3);
  });

  it("EBP04-014 5.12: when you discard a battle card from your hand with the opponent at 0 rage, destroys 1 of their rank 4 or lower battle cards", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP04-014"), 3);
    opp.rage = 0;
    place(state, opp, battleCard({ rank: 4 }), 1);
    // The invasion's discard counts (decision 367).
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("EBP04-014 7.4.3, E13, Q20: on the opponent's turn in zone 6 or beyond, with 2 battle cards, a discarded battle card makes it counter-proof against 30,000 for the turn; it doesn't move", () => {
    const run = (power: number) => {
      const { state, me, opp } = opponentsTurn();
      monster(state, me, real("EBP04-014"), 6);
      opp.rage = 1; // its other ability would destroy their battle card at 0 rage
      place(state, me, battleCard(), 1);
      place(state, me, battleCard(), 2);
      me.hand = [];
      inHand(state, me, battleCard());
      place(state, opp, battleCard({ counterOrThreat: power }), 7);
      const after = settleUntil(pass(state), "7.5.1");
      return {
        position: self(after, me).monsterPosition,
        logs: newLogTypes(after, state),
      };
    };
    const proof = run(30000);
    expect(proof.position).toBe(6);
    expect(proof.logs).toContain("counterPrevented");
    expect(proof.logs).not.toContain("counter");
    expect(run(31000).logs).toContain("counter");
  });

  it("EBP04-015 5.12: when you discard a battle card from your hand with the opponent at 0 rage, destroys 1 of their rank 6 or lower battle cards", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP04-015"), 3);
    opp.rage = 0;
    place(state, opp, battleCard({ rank: 6 }), 1);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("EBP04-016 C3, 4.4.3: +3,000 threat while its zone number is at least the opponent's monster's", () => {
    const { state, me, opp } = setup(5);
    monster(state, me, real("EBP04-016"), 5);
    me.rage = 0;
    expect(getThreat(state, me.id)).toBe(5000); // the opponent's monster is in zone 8
    opp.monsterPosition = 5;
    expect(getThreat(state, me.id)).toBe(8000);
    opp.monsterPosition = 4;
    expect(getThreat(state, me.id)).toBe(8000);
  });

  it("EBP04-017 C3, 7.4.2: +5,000 total counter power while its zone number is at least the opponent's monster's", () => {
    const { state, me, opp } = setup(5);
    monster(state, me, real("EBP04-017"), 5);
    place(state, me, battleCard({ counterOrThreat: 1000 }), 1);
    expect(counterPowerOf(state, me)).toBe(1000);
    opp.monsterPosition = 2;
    expect(counterPowerOf(state, me)).toBe(6000);
  });

  it("EBP04-018 12.2: on enter with 5 monster cards in the discard pile, destroys 1 rank 6 or lower battle card; +10,000 threat at or past the opponent's monster", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, godzilla(3, ["Blue"]), 3);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    place(state, opp, battleCard({ rank: 6 }), 1);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-018"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
    const rage = self(after, me).rage * 5000;
    expect(getThreat(after, me.id)).toBe(20000 + rage);
    opponentOf(after, me).monsterPosition = 3;
    expect(getThreat(after, me.id)).toBe(30000 + rage);
  });

  it("EBP04-019 C3, 7.4.2: at or past the opponent's monster with 5 monster cards in the discard pile, +10,000 threat and +10,000 total counter power", () => {
    const { state, me, opp } = setup(5);
    monster(state, me, real("EBP04-019"), 5);
    me.rage = 0;
    opp.monsterPosition = 5;
    expect(getThreat(state, me.id)).toBe(34000);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    expect(getThreat(state, me.id)).toBe(44000);
    expect(counterPowerOf(state, me)).toBe(10000);
  });

  it("EBP04-020 12.2, 4.4.5.2: on enter with a [base] card in play, destroys the opponent's battle cards in zones adjacent to their monster", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, monsterCard(4, { traits: ["Mothra"] }), 3);
    inStrategy(state, me, real("EBP03-070"));
    // The opponent's monster is in zone 8: its zones 7 and 3 are adjacent (4.4.5.2).
    place(state, opp, battleCard(), 7);
    place(state, opp, battleCard(), 3);
    place(state, opp, battleCard({ id: 964201 }), 1);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-020"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "1": [964201] });
  });
});

describe("EBP04 Godzilla Aquatilis to SpaceGodzilla, green", () => {
  it("EBP04-021 7.4.1, 5.7.3: at your counter phase mills 1; a green battle card makes the opponent discard down to 4", () => {
    const run = (top: Card) => {
      const { state, me, opp } = setup(3);
      monster(state, me, real("EBP04-021"), 3);
      onDeck(state, me, top);
      handOf(state, opp, 6);
      return opponentOf(settleUntil(pass(state), "7.4.2"), me).hand.length;
    };
    expect(run(green())).toBe(4);
    expect(run(battleCard({ colors: ["Red"] }))).toBe(6);
  });

  it("EBP04-022 5.15, 5.7.3: when countered, mills 5 and destroys 1 opponent battle card with 6,000 or lower counter power in zones 1-5 per green battle card milled", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP04-022"), 3);
    // A rank III Godzilla to come in after the counter (5.15.1.2).
    me.monsterDeck = [addCard(state, godzilla(3, ["Green"]), me.id)];
    for (const card of [green(), green(), battleCard(), monsterCard(1)])
      onDeck(state, me, card);
    place(state, opp, battleCard({ counterOrThreat: 99000 }), 7);
    place(state, opp, battleCard({ counterOrThreat: 6000 }), 1);
    place(state, opp, battleCard({ counterOrThreat: 6000 }), 2);
    place(state, opp, battleCard({ counterOrThreat: 6000 }), 3);
    place(state, opp, battleCard({ id: 964221, counterOrThreat: 7000 }), 4);
    const after = settleUntil(pass(state), "7.5.1");
    expect(newLogTypes(after, state)).toContain("counter");
    const left = zoneCardIds(opponentOf(after, me));
    expect(Object.keys(left)).toHaveLength(3); // 99,000, 7,000 and one 6,000 card
    expect(left["4"]).toEqual([964221]);
  });

  it("EBP04-023 10.8.1: +10,000 threat for each opponent battle card in its column", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP04-023"), 3);
    opp.monsterPosition = 6;
    me.rage = 0;
    place(state, opp, battleCard(), 3);
    place(state, opp, battleCard(), 8);
    place(state, opp, battleCard(), 1);
    expect(getThreat(state, me.id)).toBe(37000);
  });

  it("EBP04-024 X, 12.2: on enter with 10 green battle cards in the discard pile, you may destroy any number of opponent battle cards whose ranks total 7 or less; +1,000 threat per green battle card there", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, godzilla(4, ["Green"]), 3);
    for (let i = 0; i < 10; i++) inDiscard(state, me, green());
    const three = place(state, opp, battleCard({ rank: 3 }), 1);
    const four = place(state, opp, battleCard({ rank: 4 }), 2);
    place(state, opp, battleCard({ id: 964241, rank: 5 }), 3);
    let after = playMonster(state, me, inHand(state, me, real("EBP04-024")));
    after = choose(after, (id) => id === "yes");
    after = choose(after, (id) => id === three.instanceId);
    // 3 + 5 would be 8: only the rank 4 card and Done are left.
    expect(after.pendingChoice?.options.map((o) => o.id)).toEqual([
      four.instanceId,
      "done",
    ]);
    after = settle(choose(after, (id) => id === four.instanceId));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [964241] });
    const rage = self(after, me).rage * 5000;
    expect(getThreat(after, me.id)).toBe(26000 + 10000 + rage);
  });

  it("EBP04-025 12.2, 12.3: on enter destroys 1 opponent strategy card; when invading with 10 green battle cards in the discard pile, the opponent discards down to 3", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, godzilla(4, ["Green"]), 3);
    inStrategy(state, opp, strategyCard());
    let after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-025"))),
    );
    expect(strategyIds(opponentOf(after, me))).toEqual([]);

    const next = setup(3);
    monster(next.state, next.me, real("EBP04-025"), 3);
    for (let i = 0; i < 10; i++) inDiscard(next.state, next.me, green());
    handOf(next.state, next.opp, 5);
    after = settle(invade(next.state, next.me, invader(next.state, next.me)));
    expect(opponentOf(after, next.me).hand).toHaveLength(3);
  });

  it("EBP04-026 12.3, 9.1: when invading, plays 3 Crystals tokens; in zone 6 or beyond with 3 Crystals, +10,000 total counter power", () => {
    const { state, me } = setup(5);
    monster(state, me, real("EBP04-026"), 5);
    const after = settle(invade(state, me, invader(state, me)));
    const crystals = Object.values(self(after, me).zones)
      .flat()
      .filter((s) => after.cards[s.at(-1)?.cardId ?? 0]?.name === "Crystals");
    expect(crystals).toHaveLength(3);
    expect(self(after, me).monsterPosition).toBe(6);
    const tokens = crystals.reduce(
      (t, s) => t + (after.cards[s.at(-1)?.cardId ?? 0]?.counterOrThreat ?? 0),
      0,
    );
    expect(counterPowerOf(after, self(after, me))).toBe(tokens + 10000);
  });
});

describe("EBP04 Gigan (2004)", () => {
  it("EBP04-027 5.13.1, 8.6: it can't advance or invade", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP04-027"), 3);
    invader(state, me);
    expect(
      getLegalActions(state, me.id).filter((a) => a.type === "invade"),
    ).toEqual([]);
  });

  it("EBP04-027 5.15.1, Q24: at the beginning of your main phase you may discard an [invade-2] card to counter it; the next monster comes in", () => {
    const { state, me } = opponentsTurn();
    monster(state, me, real("EBP04-027"), 1);
    me.hand = [];
    inHand(state, me, battleCard({ invadeZones: 2 }));
    me.monsterDeck = [addCard(state, real("EBP04-028"), me.id)];
    const after = settle(pass(state));
    const top = self(after, me).invadingMonsterZone.at(-1);
    expect(after.cards[top?.cardId ?? 0]?.cardNumber).toBe("EBP04-028");
    expect(newLogTypes(after, state)).toContain("counter");
  });

  it("EBP04-027 5.15.1: at the beginning of the opponent's main phase they may discard an [invade-2] card to counter it", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP04-027"), 1);
    me.monsterDeck = [addCard(state, real("EBP04-028"), me.id)];
    opp.hand = [];
    inHand(state, opp, battleCard({ invadeZones: 2 }));
    const after = settleUntil(pass(state), "7.3.2");
    const top = self(after, me).invadingMonsterZone.at(-1);
    expect(after.cards[top?.cardId ?? 0]?.cardNumber).toBe("EBP04-028");
  });

  it("EBP04-029 8.6.1, M1: the opponent can't discard [invade-1] cards for invade actions", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP04-029"), 3);
    opp.hand = [];
    inHand(state, opp, battleCard({ invadeZones: 1 }));
    const two = inHand(state, opp, battleCard({ invadeZones: 2 }));
    expect(
      getLegalActions(state, opp.id)
        .filter((a) => a.type === "invade")
        .map((a) => "cardInstanceId" in a && a.cardInstanceId),
    ).toEqual([two.instanceId]);
  });

  it("EBP04-029 12.2, 4.9: on enter with the opponent's monster in zones 1-5, you may return a [gigan] monster card from the discard pile to your hand", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, monsterCard(3, { traits: ["Gigan"] }), 3);
    opp.monsterPosition = 4;
    me.hand = [];
    inDiscard(state, me, monsterCard(1, { id: 964291, traits: ["Gigan"] }));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-029"))),
    );
    expect(self(after, me).hand.map((c) => c.cardId)).toEqual([964291]);
  });

  it("EBP04-030 7.5.4, 1.3.3: on the opponent's turn they can't draw during the end phase", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP04-030"), 3);
    handOf(state, opp, 1);
    const after = settleUntil(pass(state), "7.5.5");
    expect(opponentOf(after, me).hand).toHaveLength(1);
    expect(newLogTypes(after, state)).toContain("noDraw");
  });

  it("EBP04-030 12.2: on enter destroys 1 of the opponent's battle cards in zones 1-5", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, monsterCard(4, { traits: ["Gigan"] }), 3);
    place(state, opp, battleCard(), 2);
    place(state, opp, battleCard({ id: 964301 }), 7);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-030"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "7": [964301] });
  });
});

describe("EBP04 Monster X and Kaizer Ghidorah (C4)", () => {
  it.each([
    ["EBP04-031", 3000],
    ["EBP04-032", 10000],
  ] as const)(
    "%s C4: threat X is %i times the colors among your battle cards, White included",
    (number, times) => {
      const { state, me } = setup(3);
      monster(state, me, real(number), 3);
      me.rage = 0;
      expect(getThreat(state, me.id)).toBe(0);
      place(state, me, battleCard({ colors: ["Red"] }), 1);
      place(state, me, battleCard({ colors: ["Red", "Blue"] }), 2);
      place(state, me, battleCard({ colors: ["White"] }), 4);
      expect(getThreat(state, me.id)).toBe(3 * times);
    },
  );

  it.each(["EBP04-031", "EBP04-032"])(
    "%s 7.4.3, Q20: with 1 or fewer opponent battle cards it can't be countered and doesn't move",
    (number) => {
      const run = (cards: number) => {
        const { state, me, opp } = opponentsTurn();
        monster(state, me, real(number), 3);
        for (let i = 0; i < cards; i++)
          place(
            state,
            opp,
            battleCard({ counterOrThreat: 99000 }),
            (i + 1) as 1 | 2,
          );
        const after = settleUntil(pass(state), "7.5.1");
        return newLogTypes(after, state);
      };
      expect(run(1)).toContain("counterPrevented");
      expect(run(1)).not.toContain("counter");
      expect(run(2)).toContain("counter");
    },
  );

  it("EBP04-035 X, Q33: on enter destroys opponent battle cards one by one from the lowest zone, as many as the colors among battle cards in your discard pile", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, monsterCard(4, { traits: ["Kaizer Ghidorah"] }), 3);
    inDiscard(state, me, battleCard({ colors: ["Red"] }));
    inDiscard(state, me, battleCard({ colors: ["White"] }));
    place(state, opp, battleCard(), 2);
    place(state, opp, battleCard(), 5);
    place(state, opp, battleCard({ id: 964351 }), 7);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP04-035"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "7": [964351] });
  });

  it("EBP04-036 C4: +5,000 threat for each color among battle cards in your discard pile", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP04-036"), 3);
    me.rage = 0;
    inDiscard(state, me, battleCard({ colors: ["Green", "Blue"] }));
    inDiscard(state, me, battleCard({ colors: ["Green"] }));
    inDiscard(state, me, strategyCard({ colors: ["Red"] })); // not a battle card
    expect(getThreat(state, me.id)).toBe(40000);
  });
});
