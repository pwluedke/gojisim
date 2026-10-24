import { type Card, getCardAbilities } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  type GameState,
  getCounterPower,
  getLegalActions,
  getPlayerView,
  getThreat,
  type PlayerState,
  undoBoundary,
  type ZoneNumber,
} from "../src";
import {
  activate,
  choose,
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

// M12c-2: EBP03's last 14 cards (docs/abilities/m12-plan.md: C4, E14, E16, E20, K1, K2, X, C5
// `countsAs`, and two new actions). One test (or more) per card, named with its rules.

const pass = (state: GameState) =>
  applyAction(state, { type: "pass", player: state.turnPlayer });

const inStrategy = (
  state: GameState,
  player: PlayerState,
  card: Card,
  zone = 0,
  turn = state.turn,
) =>
  player.strategyZones[zone]?.push({
    card: addCard(state, card, player.id),
    placedOnTurn: turn,
  });

const strategyIds = (state: GameState, player: PlayerState) =>
  self(state, player)
    .strategyZones.flat()
    .map((p) => p.card.cardId);

describe("EBP03-004 Godzilla (2001): invade with the deck's top card (E21) and protected rage (M1, Q16)", () => {
  const deckInvade = (state: GameState, player: PlayerState) =>
    getLegalActions(state, player.id).find((a) => a.type === "invadeFromDeck");

  it("8.6.1, 10.9.1: the top card of the deck goes to the discard pile instead of a hand card; its invasion icon counts", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP03-004"), 1);
    const top = onDeck(state, me, battleCard({ id: 963041, invadeZones: 2 }));
    const hand = me.hand.length;
    const action = deckInvade(state, me);
    expect(action).toEqual({ type: "invadeFromDeck", player: me.id });
    const after = settle(applyAction(state, action!));
    expect(self(after, me).monsterPosition).toBe(3);
    expect(self(after, me).hand).toHaveLength(hand);
    expect(self(after, me).discard.map((c) => c.cardId)).toContain(963041);
    expect(self(after, me).deck[0]?.instanceId).not.toBe(top.instanceId);
    expect(newLogTypes(after, state)).toEqual(
      expect.arrayContaining(["replace", "mill", "invade", "invasionDone"]),
    );
    // 8.6.2: once per turn, either way.
    expect(
      getLegalActions(after, me.id).some(
        (a) => a.type === "invade" || a.type === "invadeFromDeck",
      ),
    ).toBe(false);
  });

  it("8.6.1: not offered with an empty deck, or for another monster", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP03-004"), 1);
    me.deck = [];
    expect(deckInvade(state, me)).toBeUndefined();
    const other = setup(1);
    monster(other.state, other.me, real("EBP03-005"), 1);
    expect(deckInvade(other.state, other.me)).toBeUndefined();
  });

  it("M5e: the milled card becomes known, so the invasion can't be undone", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP03-004"), 1);
    onDeck(state, me, battleCard());
    const action = deckInvade(state, me)!;
    const after = settle(applyAction(state, action));
    expect(undoBoundary(state, after, action, me.id)).toBe("reveal");
  });

  it("Q16, 1.3.3: on the opponent's turn, in zone 4 or beyond, the opponent's effects can't reduce its master's rage", () => {
    const run = (zone: ZoneNumber) => {
      const { state, me, opp } = opponentsTurn();
      monster(state, me, real("EBP03-004"), zone);
      me.rage = 3;
      opp.monsterPosition = 7;
      // Their Godzilla Captured! (EBP03-079) sets my rage to 0.
      const after = settle(
        activate(state, opp, inHand(state, opp, real("EBP03-079"))),
      );
      return { rage: self(after, me).rage, logs: newLogTypes(after, state) };
    };
    expect(run(4)).toMatchObject({ rage: 3 });
    expect(run(4).logs).toContain("rageProtected");
    expect(run(3).rage).toBe(0);
  });
});

describe("EBP03-013 Godzilla (1995): a third strategy zone (E20), and losing (E16)", () => {
  it("4.5.2: on enter you have 3 strategy zones for the rest of the game; strategy zone 3 can be used", () => {
    const { state, me } = setup(6);
    monster(state, me, monsterCard(4, { traits: ["Godzilla"] }), 6);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-013"))),
    );
    expect(self(after, me).strategyZones).toHaveLength(3);
    const card = inHand(after, self(after, me), strategyCard({ rank: 1 }));
    expect(
      getLegalActions(after, me.id).filter(
        (a) =>
          a.type === "activateStrategy" && a.cardInstanceId === card.instanceId,
      ),
    ).toHaveLength(3);
    // The view shows all 3.
    expect(
      getPlayerView(after, me.id).players.find((p) => p.id === me.id)
        ?.strategyZones,
    ).toHaveLength(3);
  });

  it("4.5.2: it stays 3 after the card leaves play", () => {
    const { state, me } = setup(6);
    monster(state, me, monsterCard(4, { traits: ["Godzilla"] }), 6);
    let after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-013"))),
    );
    self(after, me).invadingMonsterZone = [
      addCard(after, monsterCard(4), me.id),
    ];
    after = settleUntil(pass(after), "7.3.2");
    expect(self(after, me).strategyZones).toHaveLength(3);
  });

  it("1.2.4: on the opponent's turn, at the beginning of the counter phase with no cards in your strategy zones, you lose", () => {
    const run = (withStrategy: boolean) => {
      const { state, me } = opponentsTurn();
      monster(state, me, real("EBP03-013"), 2);
      if (withStrategy) inStrategy(state, me, strategyCard());
      return settleUntil(pass(state), "7.4.2").result;
    };
    expect(run(false)).toMatchObject({ reason: "effect", rule: "1.2.4" });
    expect(run(true)).toBeNull();
  });
});

describe("EBP03-051 Godzilla Jr.: a play on top of a battle card (M2)", () => {
  it("8.2.1, 3.2.5: it can be played on top of your Little Godzilla battle card 2 ranks lower, stacked on it; +5,000 per card under it", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 5;
    const baby = place(
      state,
      me,
      battleCard({ id: 963511, traits: ["Little Godzilla"] }),
      2,
    );
    const jr = inHand(state, me, real("EBP03-051"));
    const plays = getLegalActions(state, me.id).filter(
      (a) => a.type === "playBattle" && a.cardInstanceId === jr.instanceId,
    );
    // Rank 7: only the play on top (7 - 2 = 5) fits the opponent's monster in zone 5.
    expect(plays).toEqual([
      {
        type: "playBattle",
        player: me.id,
        cardInstanceId: jr.instanceId,
        zone: 2,
        onTop: true,
      },
    ]);
    const after = settle(applyAction(state, plays[0]!));
    const stack = self(after, me).zones[2][0];
    expect(stack?.map((c) => c.cardId)).toEqual([963511, real("EBP03-051").id]);
    expect(getCounterPower(after, stack!.at(-1)!)).toBe(11000);
    expect(baby).toBeDefined();
  });

  it("without a Little Godzilla battle card there is no play on top", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 8;
    place(state, me, battleCard(), 2);
    const jr = inHand(state, me, real("EBP03-051"));
    expect(
      getLegalActions(state, me.id).some(
        (a) =>
          a.type === "playBattle" &&
          a.cardInstanceId === jr.instanceId &&
          a.onTop,
      ),
    ).toBe(false);
  });
});

describe("EBP03-067 Monster X (C4 colors, X lowest rank)", () => {
  it("C4: counter power X is 3,000 per color among your other battle cards, White included", () => {
    const { state, me } = setup(6);
    const x = place(state, me, real("EBP03-067"), 1);
    expect(getCounterPower(state, x)).toBe(0);
    place(state, me, battleCard({ colors: ["Red"] }), 2);
    place(state, me, battleCard({ colors: ["Blue", "Red"] }), 3);
    place(state, me, battleCard({ colors: ["White"] }), 4);
    expect(getCounterPower(state, x)).toBe(9000);
  });

  it("T3, Q33: on your turn, discarded from your hand with 2 colors among your battle cards, it is played and destroys 1 of the opponent's lowest ranked battle cards", () => {
    const { state, me, opp } = setup(1);
    place(state, me, battleCard({ colors: ["Red"] }), 3);
    place(state, me, battleCard({ colors: ["Blue"] }), 4);
    place(state, opp, battleCard({ id: 963671, rank: 2 }), 2);
    place(state, opp, battleCard({ id: 963672, rank: 5 }), 3);
    me.hand = [];
    const x = inHand(state, me, real("EBP03-067"));
    const after = settle(invade(state, me, x));
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      real("EBP03-067").id,
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [963672] });
  });

  it("with 1 color it stays in the discard pile", () => {
    const { state, me } = setup(1);
    place(state, me, battleCard({ colors: ["Red"] }), 3);
    me.hand = [];
    const after = settle(
      invade(state, me, inHand(state, me, real("EBP03-067"))),
    );
    expect(self(after, me).discard.map((c) => c.cardId)).toContain(
      real("EBP03-067").id,
    );
  });
});

describe("EBP03-068 Godzilla Flies (E14 vertical move, M1)", () => {
  it("4.4.5.1, Q21: your rank III monster in zone 3 moves to zone 8; battle cards in zones 4-7 stay; no advance; your battle card in zone 8 is crushed (11.3)", () => {
    const { state, me } = setup(3);
    monster(state, me, monsterCard(3), 3);
    place(state, me, battleCard({ id: 963681 }), 4);
    place(state, me, battleCard({ id: 963682 }), 7);
    place(state, me, battleCard(), 8);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-068"))),
    );
    expect(self(after, me).monsterPosition).toBe(8);
    expect(zoneCardIds(self(after, me))).toEqual({
      "4": [963681],
      "7": [963682],
    });
    const types = newLogTypes(after, state);
    expect(types).toContain("moveVertically");
    expect(types).not.toContain("advance");
  });

  it("M1: while it is in play on your turn, your monster can't invade; a rank II monster doesn't move", () => {
    const { state, me } = setup(3);
    monster(state, me, monsterCard(2), 3);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-068"))),
    );
    expect(self(after, me).monsterPosition).toBe(3);
    expect(getLegalActions(after, me.id).some((a) => a.type === "invade")).toBe(
      false,
    );
  });
});

describe("EBP03 Base cards (K1, 12.9)", () => {
  it.each(["EBP03-070", "EBP03-075", "EBP03-076", "EBP03-080"])(
    "%s 12.9.2: it stays in its strategy zone at your start phase (7.2.3)",
    (number) => {
      const { state, me } = opponentsTurn();
      inStrategy(state, me, real(number), 0, state.turn - 1);
      inStrategy(state, me, strategyCard({ id: 963701 }), 1, state.turn - 1);
      const after = settleUntil(pass(state), "7.3.1");
      expect(after.turnPlayer).toBe(me.id);
      expect(strategyIds(after, me)).toEqual([real(number).id]);
    },
  );

  it("EBP03-070 T6, Q18, Q19: destroyed when any monster invades into zones 6-8, the opponent's included", () => {
    const run = (from: ZoneNumber) => {
      const { state, me, opp } = opponentsTurn();
      inStrategy(state, me, real("EBP03-070"));
      opp.monsterPosition = from;
      const after = settle(invade(state, opp, invader(state, opp)));
      return strategyIds(after, me);
    };
    expect(run(5)).toEqual([]);
    // 6 to 7 also enters zones 6-8 (Q18).
    expect(run(6)).toEqual([]);
    expect(run(4)).toEqual([real("EBP03-070").id]);
  });

  it("EBP03-070 5.8: at your counter phase, searches for a Mech or Weapon battle card", () => {
    const { state, me } = setup(3);
    inStrategy(state, me, real("EBP03-070"));
    me.deck.push(
      addCard(state, battleCard({ id: 963702, traits: ["Mech"] }), me.id),
    );
    const after = settleUntil(pass(state), "7.4.2");
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(963702);
  });

  it("EBP03-075 5.17: at your counter phase, evolves 1 of your rank 4 or lower battle cards with Evolution", () => {
    const { state, me } = setup(3);
    inStrategy(state, me, real("EBP03-075"));
    place(state, me, real("EBP03-044"), 1);
    me.deck.push(
      addCard(state, battleCard({ traits: ["Mothra"], rank: 7 }), me.id),
    );
    const after = settleUntil(pass(state), "7.4.2");
    expect(self(after, me).zones[1][0]).toHaveLength(2);
  });

  it("EBP03-076 10.8.1: on the opponent's turn, +5,000 threat per card in your zones 1-5 and 8, your monster included", () => {
    const { state, me } = opponentsTurn();
    monster(state, me, monsterCard(1, { counterOrThreat: 6000 }), 2);
    inStrategy(state, me, real("EBP03-076"));
    place(state, me, battleCard(), 1);
    place(state, me, battleCard(), 8);
    place(state, me, battleCard(), 6); // not counted
    // 2 battle cards + the monster in zone 2.
    expect(getThreat(state, me.id)).toBe(6000 + 15000);
    state.turnPlayer = me.id;
    expect(getThreat(state, me.id)).toBe(6000);
  });

  it("EBP03-080 5.11: at your counter phase you may play up to 1 Godzilla battle card from your hand", () => {
    const { state, me } = setup(3);
    inStrategy(state, me, real("EBP03-080"));
    me.hand = [];
    inHand(state, me, battleCard({ id: 963801, traits: ["Godzilla"] }));
    const after = settleUntil(pass(state), "7.4.2");
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      963801,
    );
  });
});

describe("EBP03-071 Godzilla's Skeleton (C5 countsAs, Q34)", () => {
  it('Q34: in your discard pile it counts toward "10 monster cards in your discard pile"', () => {
    const { state, me } = setup();
    monster(state, me, real("EBP02-023"), 2);
    for (let i = 0; i < 9; i++) inDiscard(state, me, monsterCard(1));
    expect(getThreat(state, me.id)).toBe(34000);
    inDiscard(state, me, real("EBP03-071"));
    expect(getThreat(state, me.id)).toBe(44000);
  });

  it('Q34: it is not a monster card for anything else (a "return a monster card" can\'t pick it)', () => {
    const { state, me } = setup(4);
    inDiscard(state, me, real("EBP03-071"));
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-077"))),
    );
    expect(self(after, me).hand.map((c) => c.cardId)).not.toContain(
      real("EBP03-071").id,
    );
  });

  it("5.8, 5.4: look at the top 4, keep any on top, the rest to the discard pile, then draw 2", () => {
    const { state, me } = setup(8);
    me.hand = [];
    for (let i = 0; i < 4; i++) onDeck(state, me, battleCard());
    let after = activate(state, me, inHand(state, me, real("EBP03-071")));
    after = settle(choose(after, (id) => id === "done"));
    expect(self(after, me).hand).toHaveLength(2);
    expect(self(after, me).discard).toHaveLength(4);
  });
});

describe("EBP03-078 Megalon and Gigan: Villain Tag Team (X, 4.4.5.5)", () => {
  it("with 3 battle cards in the opponent's zones, destroys the rightmost and the leftmost from your view", () => {
    const { state, me, opp } = setup(5);
    opp.monsterPosition = 8;
    // From my view the opponent's zone 1 is rightmost and zone 5 leftmost (4.4.5.5.2).
    place(state, opp, battleCard({ id: 963781 }), 1);
    place(state, opp, battleCard({ id: 963782 }), 3);
    place(state, opp, battleCard({ id: 963783 }), 5);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-078"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [963782] });
  });

  it("Q33: cards tied for a position are the chooser's pick", () => {
    const { state, me, opp } = setup(5);
    opp.monsterPosition = 1;
    place(state, opp, battleCard(), 3);
    place(state, opp, battleCard(), 8); // same position as zone 3
    place(state, opp, battleCard(), 5);
    const after = activate(state, me, inHand(state, me, real("EBP03-078")));
    // The rightmost from my view: the opponent's zones 3 and 8 (position 2) beat zone 5.
    expect(after.pendingChoice?.options).toHaveLength(2);
  });

  it("with 2 battle cards it does nothing", () => {
    const { state, me, opp } = setup(5);
    place(state, opp, battleCard(), 1);
    place(state, opp, battleCard(), 2);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-078"))),
    );
    expect(newLogTypes(after, state)).toContain("conditionNotMet");
  });
});

describe("EBP03 Resonance cards (K2)", () => {
  it.each([
    ["EBP03-006", ["Red", "Blue"]],
    ["EBP03-018", ["Blue", "Green"]],
    ["EBP03-024", ["Green", "Red"]],
  ] as const)(
    "%s 12.8: the Resonance keyword with its colors, and a deck rule",
    (number, colors) => {
      const data = getCardAbilities(number);
      expect(data.abilities).toEqual([
        { kind: "keyword", keyword: { name: "resonance", colors } },
      ]);
      expect(data.deckRules?.[0]).toMatchObject({ rule: "resonance", colors });
    },
  );
});

describe("M12c-2 engine pieces", () => {
  it("4.5.2: the third strategy zone is logged (E20)", () => {
    const { state, me } = setup(6);
    monster(state, me, monsterCard(4, { traits: ["Godzilla"] }), 6);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP03-013"))),
    );
    expect(logTypes(after)).toContain("strategyZones");
  });
});
