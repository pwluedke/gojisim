import { type Card, getCardAbilities } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  type GameState,
  getRank,
  getThreat,
  type PlayerState,
} from "../src";
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
  logTypes,
  monsterCard,
  strategyCard,
} from "./fixtures/state";

// M12c-1: EBP03 monster cards and EPR-020 (docs/abilities/m12-plan.md), with only pieces built in
// M12a and M12b plus small extensions. One test (or more) per card, named with its rules.

const pass = (state: GameState) =>
  applyAction(state, { type: "pass", player: state.turnPlayer });

const inStrategy = (state: GameState, player: PlayerState, card: Card) =>
  player.strategyZones[0].push({
    card: addCard(state, card, player.id),
    placedOnTurn: state.turn,
  });

/** Cards under the player's monster, bottom first (3.2). */
function under(state: GameState, player: PlayerState, cards: Card[]) {
  player.invadingMonsterZone.unshift(
    ...cards.map((c) => addCard(state, c, player.id)),
  );
}

const rank5 = () => battleCard({ rank: 5 });
const mothra = (rank: number) => monsterCard(rank, { traits: ["Mothra"] });
const mech = (rank: number) =>
  monsterCard(rank, { traits: ["Mechagodzilla", "Weapon"] });
const guardians = (rank: number) =>
  monsterCard(rank, { traits: ["Sacred Guardian Beasts"] });
/** A strategy card with the printed [base] icon (EBP03-070 Mechagodzilla Hanger). */
const base = () => real("EBP03-070");

/** My counter phase with enough counter power to counter the opponent's monster (7.4.3). */
function counterTheOpponent(state: GameState, me: PlayerState) {
  place(state, me, battleCard({ counterOrThreat: 99000 }), 1);
  return settle(pass(state));
}

describe("EBP03 keywords (12.5, 12.6)", () => {
  it.each([
    ["EBP03-003", 2],
    ["EBP03-005", 3],
    ["EBP03-011", 3],
  ] as const)("%s 12.5.1: Burst rank %i", (number, rank) => {
    expect(getCardAbilities(number).abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "burst", rank },
    });
  });

  it.each([
    ["EBP03-044", 7],
    ["EBP03-050", 8],
  ] as const)("%s 12.6.1: Evolution rank %i, trait Mothra", (number, rank) => {
    expect(getCardAbilities(number).abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "evolution", rank, trait: "Mothra" },
    });
  });

  it("EBP03-031 6.1.1.4: any number of copies (Q13)", () => {
    expect(getCardAbilities("EBP03-031").deckRules).toEqual([
      { rule: "anyNumber" },
    ]);
  });
});

describe("EBP03 Godzilla (2001), red (12.4 Awakening)", () => {
  it("EBP03-001 7.5.1, 12.4: in zone 4 or beyond, at your end phase you may discard a rank 5 or higher battle card to advance 1", () => {
    const { state, me } = setup(4);
    monster(state, me, real("EBP03-001"), 4);
    me.hand = [];
    inHand(state, me, rank5());
    const after = settleUntil(pass(state), "7.5.2");
    expect(self(after, me).monsterPosition).toBe(5);
    expect(newLogTypes(after, state)).toContain("discard");
  });

  it("EBP03-001 12.4: in zone 3 it doesn't trigger", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP03-001"), 3);
    me.hand = [];
    inHand(state, me, rank5());
    expect(self(settleUntil(pass(state), "7.5.2"), me).monsterPosition).toBe(3);
  });

  it("EBP03-001 12.4: +5,000 threat in zone 6 or beyond", () => {
    const { state, me } = setup(5);
    monster(state, me, real("EBP03-001"), 5);
    expect(getThreat(state, me.id)).toBe(4000);
    me.monsterPosition = 6;
    expect(getThreat(state, me.id)).toBe(9000);
  });

  it("EBP03-002 7.4.1: on the opponent's turn, in zone 4 or beyond, at the beginning of the counter phase you may discard a rank 5 battle card for 1 rage", () => {
    const { state, me } = opponentsTurn();
    monster(state, me, real("EBP03-002"), 4);
    me.hand = [];
    inHand(state, me, rank5());
    expect(self(settleUntil(pass(state), "7.4.2"), me).rage).toBe(1);
  });

  it("EBP03-002 7.4.1: in zone 8, at the beginning of your counter phase you may discard a rank 5 battle card for 2 rage", () => {
    const { state, me } = setup(8);
    monster(state, me, real("EBP03-002"), 8);
    me.hand = [];
    inHand(state, me, rank5());
    expect(self(settleUntil(pass(state), "7.4.2"), me).rage).toBe(2);
  });

  it.each([
    ["EBP03-003", 2, 6],
    ["EBP03-005", 3, 7],
  ] as const)(
    "%s 7.4.1, 5.12: in zone 8 you may discard a rank 5 battle card for %i rage, then destroy the opponent's rank %i or lower battle cards",
    (number, rage, maxRank) => {
      const { state, me, opp } = setup(8);
      monster(state, me, real(number), 8);
      me.hand = [];
      inHand(state, me, rank5());
      opp.monsterPosition = 6;
      place(state, opp, battleCard({ id: 963301, rank: maxRank }), 1);
      place(state, opp, battleCard({ id: 963302, rank: maxRank + 1 }), 2);
      const after = settleUntil(pass(state), "7.4.2");
      expect(self(after, me).rage).toBe(rage);
      expect(zoneCardIds(opponentOf(after, me))).toEqual({ "2": [963302] });
    },
  );
});

describe("EBP03 Multi-Purpose Fighting System 3", () => {
  it("EBP03-007 12.3, 5.10: when invading, reveals as many cards as the opponent's monster's rank and takes 1 red or blue battle card; the rest go to the discard pile", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP03-007"), 1);
    monster(state, opp, monsterCard(3), 8);
    me.hand = [];
    const blue = battleCard({ id: 963071, colors: ["Blue"] });
    for (const card of [monsterCard(1), strategyCard(), blue].reverse())
      onDeck(state, me, card);
    const after = settle(invade(state, me, invader(state, me)));
    expect(self(after, me).hand.map((c) => c.cardId)).toEqual([963071]);
    expect(self(after, me).discard).toHaveLength(3); // the invader and 2 revealed cards
  });

  it("EBP03-008 5.12: on enter with a blue battle card in your zones, destroys 1 of the opponent's rank 5 or lower battle cards", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, mech(3), 3);
    place(state, me, battleCard({ colors: ["Blue"] }), 1);
    place(state, opp, battleCard({ rank: 5 }), 1);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-008"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("EBP03-008 4.4.5.4: on the opponent's turn, with a red battle card in your zones, at the counter phase destroys 1 rank 5 or lower battle card in its column", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP03-008"), 2);
    place(state, me, battleCard({ colors: ["Red"] }), 1);
    place(state, opp, battleCard({ id: 963081, rank: 5 }), 4); // column of my zone 2
    place(state, opp, battleCard({ id: 963082, rank: 5 }), 1);
    const after = settleUntil(pass(state), "7.4.2");
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "1": [963082] });
  });

  it("EBP03-009 4.4.5.4, 4.4.5.2: on enter you pick an opponent zone in its column; rank 6 or lower battle cards there and adjacent are destroyed", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, mech(4), 3);
    opp.monsterPosition = 6;
    place(state, opp, battleCard({ rank: 6 }), 2);
    place(state, opp, battleCard({ rank: 6 }), 4);
    place(state, opp, battleCard({ id: 963091, rank: 7 }), 3);
    place(state, opp, battleCard({ id: 963092, rank: 6 }), 5);
    let after = playMonster(state, me, inHand(state, me, real("EBP03-009")));
    // My zone 3's column: the opponent's zones 3 and 8 (4.4.5.4).
    expect(after.pendingChoice?.options.map((o) => o.id)).toEqual([
      `${opp.id}:3`,
      `${opp.id}:8`,
    ]);
    after = settle(choose(after, (id) => id === `${opp.id}:3`));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({
      "3": [963091],
      "5": [963092],
    });
  });

  it("EBP03-010 5.7.2: on enter with 2 battle cards in your zones, the opponent discards down to 4; a battle card discarded gives you 1 rage", () => {
    const run = (hand: () => Card) => {
      const { state, me, opp } = setup(3);
      monster(state, me, mech(3), 3);
      place(state, me, battleCard(), 1);
      place(state, me, battleCard(), 2);
      opp.hand = [];
      for (let i = 0; i < 5; i++) inHand(state, opp, hand());
      const after = settle(
        playMonster(state, me, inHand(state, me, real("EBP03-010"))),
      );
      return {
        hand: opponentOf(after, me).hand.length,
        rage: self(after, me).rage,
      };
    };
    // +1 for the monster play (8.5.1.1), +1 for the discarded battle card.
    expect(run(() => battleCard())).toEqual({ hand: 4, rage: 2 });
    expect(run(() => monsterCard(1))).toEqual({ hand: 4, rage: 1 });
  });

  it("EBP03-011 5.10: on enter, reveals as many cards as the opponent's monster's rank and takes up to 1 red and up to 1 blue battle card", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, mech(4), 3);
    monster(state, opp, monsterCard(3), 8);
    me.hand = [];
    const red = battleCard({ id: 963111, colors: ["Red"] });
    const blue = battleCard({ id: 963112, colors: ["Blue"] });
    for (const card of [red, blue, strategyCard()].reverse())
      onDeck(state, me, card);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-011"))),
    );
    expect(
      self(after, me)
        .hand.map((c) => c.cardId)
        .sort(),
    ).toEqual([963111, 963112]);
    expect(newLogTypes(after, state)).toContain("mill");
  });

  it("EBP03-011 5.10: two red battle cards revealed: only one is taken", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, mech(4), 3);
    monster(state, opp, monsterCard(2), 8);
    me.hand = [];
    for (let i = 0; i < 2; i++)
      onDeck(state, me, battleCard({ colors: ["Red"] }));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-011"))),
    );
    expect(self(after, me).hand).toHaveLength(1);
  });
});

describe("EBP03 Godzilla, blue", () => {
  it("EBP03-012 5.9: on enter with 1 or fewer strategy cards in play, you may activate a blue rank 6 or lower strategy card from your hand", () => {
    const { state, me } = setup(3);
    monster(state, me, godzilla(2, ["Blue"]), 3);
    const blue = inHand(
      state,
      me,
      strategyCard({ id: 963121, colors: ["Blue"], rank: 6 }),
    );
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-012"))),
    );
    expect(
      self(after, me)
        .strategyZones.flat()
        .map((p) => p.card.cardId),
    ).toEqual([963121]);
    expect(self(after, me).hand.map((c) => c.instanceId)).not.toContain(
      blue.instanceId,
    );
  });

  it("EBP03-012: with 2 strategy cards in play it doesn't", () => {
    const { state, me } = setup(3);
    monster(state, me, godzilla(2, ["Blue"]), 3);
    inStrategy(state, me, strategyCard());
    me.strategyZones[1].push({
      card: addCard(state, strategyCard(), me.id),
      placedOnTurn: state.turn,
    });
    inHand(state, me, strategyCard({ colors: ["Blue"], rank: 6 }));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-012"))),
    );
    expect(newLogTypes(after, state)).toContain("conditionNotMet");
  });

  it("EBP03-014 7.5.1: at your end phase you may discard a battle card to draw 1", () => {
    const { state, me } = setup(2);
    monster(state, me, real("EBP03-014"), 2);
    me.hand = [];
    inHand(state, me, battleCard());
    const after = settleUntil(pass(state), "7.5.2");
    expect(self(after, me).hand).toHaveLength(1);
    expect(self(after, me).discard).toHaveLength(1);
  });

  it("EBP03-015 5.7, 8.6.1: whenever you discard a battle card from your hand (an invasion too), the opponent loses 1 rage", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP03-015"), 1);
    opp.rage = 2;
    const after = settle(invade(state, me, invader(state, me)));
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EBP03-016 5.7: a battle card discarded with the opponent at 0 rage gives you 1 rage instead", () => {
    const run = (oppRage: number) => {
      const { state, me, opp } = setup(1);
      monster(state, me, real("EBP03-016"), 1);
      opp.rage = oppRage;
      const after = settle(invade(state, me, invader(state, me)));
      return [self(after, me).rage, opponentOf(after, me).rage];
    };
    expect(run(1)).toEqual([0, 0]);
    expect(run(0)).toEqual([1, 0]);
  });

  it("EBP03-017 5.7, 5.12: on enter you may discard a battle card to destroy a rank 6 or lower battle card; that discard also triggers its first ability", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, godzilla(4, ["Blue"]), 3);
    me.hand = [];
    inHand(state, me, battleCard());
    opp.rage = 2;
    place(state, opp, battleCard({ rank: 6 }), 1);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-017"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
    expect(opponentOf(after, me).rage).toBe(1);
  });
});

describe("EPR-020 Godzilla (2003), hand-entered (manual-cards.json)", () => {
  it("EPR-020 5.7: whenever you discard a battle card from your hand, the opponent loses 1 rage", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EPR-020"), 1);
    opp.rage = 2;
    const after = settle(invade(state, me, invader(state, me)));
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EPR-020 1.3.2.1, Q25: on your turn, when the opponent's rage goes from above 0 to 0, you gain 2 rage; not when it was already 0", () => {
    const run = (oppRage: number) => {
      const { state, me, opp } = setup(1);
      monster(state, me, real("EPR-020"), 1);
      opp.rage = oppRage;
      const after = settle(invade(state, me, invader(state, me)));
      return self(after, me).rage;
    };
    expect(run(1)).toBe(2);
    expect(run(0)).toBe(0);
  });

  it("EPR-020: on the opponent's turn the second ability doesn't trigger", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EPR-020"), 2);
    opp.rage = 1;
    // Their Space Beam (EBP03-069) makes me discard down to 4: my first ability takes their
    // rage from 1 to 0, on their turn.
    me.hand = [];
    for (let i = 0; i < 5; i++) inHand(state, me, battleCard());
    opp.monsterPosition = 4;
    const after = settle(
      applyAction(state, {
        type: "activateStrategy",
        player: opp.id,
        cardInstanceId: inHand(state, opp, real("EBP03-069")).instanceId,
        strategyZone: 1,
      }),
    );
    expect(opponentOf(after, me).rage).toBe(0);
    expect(self(after, me).rage).toBe(0);
  });
});

describe("EBP03 Mothra (1996) line and Base (T4)", () => {
  it("EBP03-019 5.15: when you counter the opponent's monster with a [base] card in play, +2 rage", () => {
    const run = (withBase: boolean) => {
      const { state, me, opp } = setup(3);
      monster(state, me, real("EBP03-019"), 3);
      opp.monsterPosition = 2;
      if (withBase) inStrategy(state, me, base());
      const after = counterTheOpponent(state, me);
      expect(logTypes(after)).toContain("counter");
      return self(after, me).rage;
    };
    expect(run(true)).toBe(2);
    expect(run(false)).toBe(0);
  });

  it("EBP03-020 5.15: when you counter with a [base] card in play, destroys 1 rank 7 or lower battle card", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP03-020"), 3);
    opp.monsterPosition = 2;
    inStrategy(state, me, base());
    place(state, opp, battleCard({ rank: 7 }), 5);
    const after = counterTheOpponent(state, me);
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("EBP03-021 4.9: on enter, returns a strategy card with [base] from your discard pile to your hand", () => {
    const { state, me } = setup(3);
    monster(state, me, mothra(3), 3);
    inDiscard(state, me, base());
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-021"))),
    );
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(base().id);
  });

  it("EBP03-022 10.8.1: +10,000 threat with a [base] card in play", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP03-022"), 3);
    expect(getThreat(state, me.id)).toBe(34000);
    inStrategy(state, me, base());
    expect(getThreat(state, me.id)).toBe(44000);
  });

  it("EBP03-023 5.17: on enter, evolves all your Mothra battle cards with Evolution", () => {
    const { state, me } = setup(3);
    monster(state, me, mothra(4), 3);
    place(state, me, real("EBP03-044"), 1);
    place(state, me, real("EBP03-044"), 2);
    for (let i = 0; i < 2; i++)
      onDeck(state, me, battleCard({ traits: ["Mothra"], rank: 7 }));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-023"))),
    );
    expect(self(after, me).zones[1][0]).toHaveLength(2);
    expect(self(after, me).zones[2][0]).toHaveLength(2);
  });

  it("EBP03-023 5.15, 5.13.2: when you counter with a [base] card in play, the opponent's monster retreats to zone 1", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP03-023"), 3);
    opp.monsterPosition = 5;
    inStrategy(state, me, base());
    const after = counterTheOpponent(state, me);
    expect(opponentOf(after, me).monsterPosition).toBe(1);
  });
});

describe("EBP03 Sacred Guardian Beasts (3.2: cards under the monster)", () => {
  it("EBP03-025 10.8.1: on your turn the opponent's battle cards are 1 rank lower; on theirs they aren't", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP03-025"), 3);
    const card = place(state, opp, battleCard({ rank: 5 }), 1);
    expect(getRank(state, card)).toBe(4);
    state.turnPlayer = opp.id;
    expect(getRank(state, card)).toBe(5);
  });

  it("EBP03-025 3.2, 5.13.1: on enter you may put a monster card from your discard pile under it to advance the opponent's monster to zone 5", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, guardians(2), 3);
    inDiscard(state, me, monsterCard(1));
    opp.monsterPosition = 2;
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-025"))),
    );
    expect(opponentOf(after, me).monsterPosition).toBe(5);
    expect(self(after, me).invadingMonsterZone).toHaveLength(3);
  });

  it("EBP03-026 10.8.1: with 3 cards under it, the opponent's battle cards are 2 ranks lower on your turn", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP03-026"), 3);
    const card = place(state, opp, battleCard({ rank: 5 }), 1);
    under(state, me, [monsterCard(1), monsterCard(1)]);
    expect(getRank(state, card)).toBe(5);
    under(state, me, [monsterCard(1)]);
    expect(getRank(state, card)).toBe(3);
  });

  it("EBP03-026 10.5.4.1: on enter you may put 2 monster cards from your discard pile under it to reduce the opponent's rage; with 1 the cost can't be paid", () => {
    const run = (monsters: number) => {
      const { state, me, opp } = setup(3);
      monster(state, me, guardians(3), 3);
      for (let i = 0; i < monsters; i++) inDiscard(state, me, monsterCard(1));
      opp.rage = 2;
      const after = settle(
        playMonster(state, me, inHand(state, me, real("EBP03-026"))),
      );
      return opponentOf(after, me).rage;
    };
    expect(run(2)).toBe(1);
    expect(run(1)).toBe(2);
  });

  it("EBP03-027 12.3, 5.7.2: when invading with 5 cards under it, the opponent discards down to 4; 3 under: ranks 2 lower", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP03-027"), 1);
    under(
      state,
      me,
      [1, 2, 3, 4, 5].map(() => monsterCard(1)),
    );
    opp.hand = [];
    for (let i = 0; i < 6; i++) inHand(state, opp, battleCard());
    const card = place(state, opp, battleCard({ rank: 5 }), 1);
    expect(getRank(state, card)).toBe(3);
    const after = settle(invade(state, me, invader(state, me)));
    expect(opponentOf(after, me).hand).toHaveLength(4);
  });

  it("EBP03-028 10.8.1: with 5 cards under it, the opponent's battle cards are 3 ranks lower on your turn", () => {
    const { state, me, opp } = setup(3);
    monster(state, me, real("EBP03-028"), 3);
    under(
      state,
      me,
      [1, 2, 3, 4, 5].map(() => monsterCard(1)),
    );
    expect(getRank(state, place(state, opp, battleCard({ rank: 5 }), 1))).toBe(
      2,
    );
  });

  it("EBP03-028 7.4.1, 5.12: on the opponent's turn, at the counter phase you may put 3 monster cards under it to destroy their rank 5 or lower battle cards in zones 1-5", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP03-028"), 2);
    for (let i = 0; i < 3; i++) inDiscard(state, me, monsterCard(1));
    opp.monsterPosition = 7;
    place(state, opp, battleCard({ rank: 5 }), 1);
    place(state, opp, battleCard({ id: 963281, rank: 5 }), 8);
    const after = settleUntil(pass(state), "7.4.2");
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "8": [963281] });
    expect(self(after, me).invadingMonsterZone).toHaveLength(4);
  });

  it("EBP03-029 12.3, 10.5.2.2.1: when invading with 7 cards under it, choose one: each player's monster loses 2 rage", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP03-029"), 1);
    under(
      state,
      me,
      [1, 2, 3, 4, 5, 6, 7].map(() => monsterCard(1)),
    );
    me.rage = 3;
    opp.rage = 3;
    let after = invade(state, me, invader(state, me));
    expect(after.pendingChoice?.options.map((o) => o.id)).toEqual([
      "0",
      "1",
      "2",
    ]);
    after = settle(choose(after, (id) => id === "2"));
    expect([self(after, me).rage, opponentOf(after, me).rage]).toEqual([1, 1]);
  });

  it("EBP03-029 5.12: or destroy every battle card of both players", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP03-029"), 1);
    under(
      state,
      me,
      [1, 2, 3, 4, 5, 6, 7].map(() => monsterCard(1)),
    );
    place(state, me, battleCard(), 3);
    place(state, opp, battleCard(), 3);
    const after = settle(
      choose(invade(state, me, invader(state, me)), (id) => id === "0"),
    );
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("EBP03-029 5.7.2: or each player discards down to 2 (E11)", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP03-029"), 1);
    under(
      state,
      me,
      [1, 2, 3, 4, 5, 6, 7].map(() => monsterCard(1)),
    );
    for (let i = 0; i < 4; i++) inHand(state, me, battleCard());
    for (let i = 0; i < 4; i++) inHand(state, opp, battleCard());
    const after = settle(
      choose(invade(state, me, invader(state, me)), (id) => id === "1"),
    );
    expect(self(after, me).hand).toHaveLength(2);
    expect(opponentOf(after, me).hand).toHaveLength(2);
  });
});
