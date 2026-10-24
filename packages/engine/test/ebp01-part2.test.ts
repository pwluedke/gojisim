import {
  type Card,
  type CardAbilities,
  getCardAbilities,
} from "@gojisim/cards";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyAction,
  checkInvariants,
  type CardInstance,
  counterPowerOf,
  type GameState,
  getCounterPower,
  getLegalActions,
  type PlayerState,
  type ZoneNumber,
} from "../src";
import { setTestAbilities } from "../src/testing";
import {
  activate,
  choose,
  gainRage,
  godzilla,
  invade,
  invader,
  newLogTypes,
  opponentOf,
  opponentsTurn,
  play,
  playMonster,
  self,
  settle,
  settleUntil,
  setup,
} from "./fixtures/play";
import {
  atPlayTiming,
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
  runTo,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";

// M12a-2: the rest of EBP01 (docs/abilities/m12-plan.md: C2, E1 to E5, E7 to E10, E13, E17,
// E18, M1, M2, and the "if" part of C1). One test (or more) per card, named with its rules.

const pass = (state: GameState) =>
  applyAction(state, { type: "pass", player: state.turnPlayer });

/** Puts cards on top of the deck so the first listed ends on top. */
function stackDeck(state: GameState, player: PlayerState, cards: Card[]) {
  return [...cards]
    .reverse()
    .map((card) => onDeck(state, player, card))
    .reverse();
}

const canPlay = (state: GameState, player: PlayerState, card: CardInstance) =>
  getLegalActions(state, player.id).some(
    (a) =>
      (a.type === "playBattle" || a.type === "activateStrategy") &&
      a.cardInstanceId === card.instanceId,
  );

const inStrategy = (state: GameState, player: PlayerState, card: Card) =>
  player.strategyZones[0].push({
    card: addCard(state, card, player.id),
    placedOnTurn: state.turn,
  });

describe("EBP01 mill cards (E2, C1)", () => {
  it("EBP01-001 5.7.3: at the beginning of your counter phase it mills 1; a monster card gives +1 rage", () => {
    const run = (top: Card) => {
      const { state, me } = setup();
      monster(state, me, real("EBP01-001"), 6);
      onDeck(state, me, top);
      return self(settleUntil(pass(state), "7.4.2"), me);
    };
    const withMonster = run(monsterCard(2));
    expect(withMonster.rage).toBe(1);
    expect(withMonster.discard.at(-1)?.cardId).toBeDefined();
    expect(run(battleCard()).rage).toBe(0);
  });

  it("EBP01-002 12.3: when invading it mills 1; a monster card destroys 1 opponent rank 5 or lower battle card", () => {
    const run = (top: Card) => {
      const { state, me, opp } = setup();
      monster(state, me, real("EBP01-002"), 1);
      place(state, opp, battleCard({ id: 965001, rank: 5 }), 2);
      onDeck(state, me, top);
      return zoneCardIds(
        opponentOf(settle(invade(state, me, invader(state, me))), me),
      );
    };
    expect(run(monsterCard(1))).toEqual({});
    expect(run(battleCard())).toEqual({ "2": [965001] });
  });

  it("EBP01-002 12.5.1: Burst rank I", () => {
    expect(getCardAbilities("EBP01-002").abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "burst", rank: 1 },
    });
  });

  it("EBP01-003 3.4: whenever its rage goes up it mills 1; a monster card destroys 1 opponent rank 6 or lower battle card", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-003"), 3);
    place(state, opp, battleCard({ id: 965011, rank: 6 }), 2);
    onDeck(state, me, monsterCard(1));
    const after = settle(
      gainRage(state, me, inHand(state, me, monsterCard(2))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("EBP01-015 5.13.1.2: on enter on your turn it mills 5, +1 rage per monster card, and advances to zone 6 if a card with [invade-2] was among them", () => {
    const { state, me } = setup();
    monster(state, me, godzilla(4), 3);
    stackDeck(state, me, [
      monsterCard(1),
      battleCard({ invadeZones: 2 }),
      monsterCard(2),
      battleCard(),
      battleCard(),
    ]);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-015"))),
    );
    // +1 for the monster play (8.5.1.1), +2 for the monster cards.
    expect(self(after, me).rage).toBe(3);
    expect(self(after, me).monsterPosition).toBe(6);
    expect(self(after, me).discard).toHaveLength(5);
  });

  it("EBP01-072 5.13.2: in the opponent's monster's column, it mills 1; a battle card makes their monster retreat if its threat is 50,000 or lower", () => {
    const run = (top: Card, rage: number) => {
      const { state, me, opp } = setup(3);
      // The opponent's zone 6 is in the same column as my zone 1 (4.4.5.4).
      opp.monsterPosition = 6;
      opp.rage = rage;
      onDeck(state, me, top);
      return opponentOf(
        settle(play(state, me, inHand(state, me, real("EBP01-072")), 1)),
        me,
      ).monsterPosition;
    };
    expect(run(battleCard(), 0)).toBe(5);
    expect(run(monsterCard(1), 0)).toBe(6);
    // 6,000 + 9 x 5,000 rage = 51,000 threat (3.4.5): too high.
    expect(run(battleCard(), 9)).toBe(6);
  });
});

describe("EBP01 advance and retreat cards (E1, C2)", () => {
  it("EBP01-008 5.13.1: on enter the opponent's monster advances 1 zone", () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(3), 1);
    opp.monsterPosition = 4;
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-008"))),
    );
    expect(opponentOf(after, me).monsterPosition).toBe(5);
  });

  it("EBP01-008 12.5.1: Burst rank II", () => {
    expect(getCardAbilities("EBP01-008").abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "burst", rank: 2 },
    });
  });

  it("EBP01-011 4.4.5.4: when it advances into the opponent's monster's column, their monster advances 1", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-011"), 4);
    // My zone 5 is in the same column as the opponent's zone 1.
    opp.monsterPosition = 1;
    const after = settle(invade(state, me, invader(state, me)));
    expect(self(after, me).monsterPosition).toBe(5);
    expect(opponentOf(after, me).monsterPosition).toBe(2);
  });

  it("EBP01-012 8.6: at the beginning of your end phase, if you invaded this turn, the opponent's monster advances 1 (C2)", () => {
    const run = (invades: boolean) => {
      const { state, me, opp } = setup();
      monster(state, me, real("EBP01-012"), 2);
      opp.monsterPosition = 4;
      const start = invades
        ? settle(invade(state, me, invader(state, me)))
        : state;
      return opponentOf(settleUntil(pass(start), "7.5.2"), me).monsterPosition;
    };
    expect(run(true)).toBe(5);
    expect(run(false)).toBe(4);
  });

  it("EBP01-030 5.13.1: the opponent's monster advances 1", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 2;
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP01-030"))),
    );
    expect(opponentOf(after, me).monsterPosition).toBe(3);
  });

  it("EBP01-078 5.13.1.2: your monster advances to zone 6; already beyond, nothing happens", () => {
    const run = (from: ZoneNumber) => {
      const { state, me } = setup(from);
      return self(
        settle(activate(state, me, inHand(state, me, real("EBP01-078")))),
        me,
      ).monsterPosition;
    };
    expect(run(4)).toBe(6);
    expect(run(7)).toBe(7);
  });
});

describe("EBP01 counter cards (M1 cannot engage, E13)", () => {
  it("EBP01-014 5.16.1: on the opponent's turn, in zone 4 or beyond with 2 battle cards, their rank 5 or lower battle cards add no counter power", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP01-014"), 4);
    place(state, me, battleCard(), 2);
    place(state, me, battleCard(), 3);
    place(state, opp, battleCard({ rank: 5, counterOrThreat: 9000 }), 1);
    place(state, opp, battleCard({ rank: 6, counterOrThreat: 1000 }), 2);
    expect(counterPowerOf(state, opp)).toBe(1000);
    me.monsterPosition = 3;
    expect(counterPowerOf(state, opp)).toBe(10000);
  });

  it("EBP01-028 5.16.1: on the opponent's turn their rank 3 or lower battle cards add no counter power", () => {
    const { state, me, opp } = opponentsTurn();
    inStrategy(state, me, real("EBP01-028"));
    place(state, opp, battleCard({ rank: 3, counterOrThreat: 9000 }), 1);
    place(state, opp, battleCard({ rank: 4, counterOrThreat: 1000 }), 2);
    expect(counterPowerOf(state, opp)).toBe(1000);
  });

  it("EBP01-038 7.4.3, 5.15.1.1: on the opponent's turn in zone 6 or beyond, 50,000 counter power doesn't counter it; it only moves back (Q14)", () => {
    const run = (power: number) => {
      const { state, me, opp } = opponentsTurn();
      monster(state, me, real("EBP01-038"), 6);
      place(state, opp, battleCard({ counterOrThreat: power }), 1);
      return settleUntil(pass(state), "7.5.1");
    };
    const held = run(50000);
    expect(logTypes(held)).toContain("counterPrevented");
    expect(logTypes(held)).not.toContain("counter");
    const me = held.players.find(
      (p) => p.id !== held.turnPlayer,
    ) as PlayerState;
    expect(me.monsterPosition).toBe(5);
    expect(me.invadingMonsterZone).toHaveLength(1);
    // 51,000 counters it; with no rank V monster its master loses (5.15.1.2.1).
    const countered = run(51000);
    expect(logTypes(countered)).toContain("counter");
    expect(countered.result?.reason).toBe("victoryThroughCountering");
  });

  it("EBP01-077 5.15.1.1: with 2 or less opponent rage, their monster moves as though countered (Q14)", () => {
    const run = (rage: number) => {
      const { state, me, opp } = setup();
      opp.monsterPosition = 7;
      opp.rage = rage;
      return settle(activate(state, me, inHand(state, me, real("EBP01-077"))));
    };
    const moved = run(2);
    expect(turnPlayer(moved).id).toBe(moved.turnPlayer);
    expect(opponentOf(moved, turnPlayer(moved)).monsterPosition).toBe(4);
    expect(logTypes(moved)).not.toContain("counter");
    expect(opponentOf(run(3), turnPlayer(run(3))).monsterPosition).toBe(7);
  });
});

describe("EBP01 protection (M1 cannot be destroyed by the opponent)", () => {
  /** The opponent activates EBP01-065: destroy all of my battle cards in zones 1-5. */
  function opponentWipes(state: GameState, opp: PlayerState) {
    opp.monsterPosition = 6;
    return settle(activate(state, opp, inHand(state, opp, real("EBP01-065"))));
  }

  it("EBP01-052 5.12: in zone 4 or beyond, in zones 1-5 with 5 monster cards in the discard pile, the opponent's effects can't destroy it", () => {
    const { state, me, opp } = opponentsTurn();
    me.monsterPosition = 4;
    const card = place(state, me, real("EBP01-052"), 2);
    place(state, me, battleCard({ id: 965021 }), 3);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    const after = opponentWipes(state, opp);
    expect(zoneCardIds(self(after, me))).toEqual({ "2": [card.cardId] });
  });

  it("EBP01-075 5.12: with 3 or more rage, in zones 1-5, the opponent's effects can't destroy it; +3,000 counter power per rage", () => {
    const { state, me, opp } = opponentsTurn();
    me.rage = 3;
    const card = place(state, me, real("EBP01-075"), 2);
    expect(getCounterPower(state, card)).toBe(5000 + 9000);
    const after = opponentWipes(state, opp);
    expect(zoneCardIds(self(after, me))).toEqual({ "2": [card.cardId] });
    me.rage = 2;
    expect(zoneCardIds(self(opponentWipes(state, opp), me))).toEqual({});
  });

  it("EBP01-080 5.12: while it is in the strategy zone, your rank 5 or lower battle cards in zones 1-5 can't be destroyed by the opponent's effects", () => {
    const { state, me, opp } = opponentsTurn();
    inStrategy(state, me, real("EBP01-080"));
    place(state, me, battleCard({ id: 965031, rank: 5 }), 2);
    place(state, me, battleCard({ id: 965032, rank: 6 }), 3);
    const after = opponentWipes(state, opp);
    expect(zoneCardIds(self(after, me))).toEqual({ "2": [965031] });
  });

  it("5.12, 11.3: protection stops effects only; crush and destroy still destroys", () => {
    const { state, me } = setup(1);
    me.rage = 3;
    place(state, me, real("EBP01-075"), 2);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(self(after, me))).toEqual({});
  });
});

describe("EBP01 play rules (M2)", () => {
  it("EBP01-027 8.2.1: its rank counts 1 lower per battle card in your zones", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 5;
    const hedorah = inHand(state, me, real("EBP01-027"));
    place(state, me, battleCard(), 1);
    place(state, me, battleCard(), 2);
    expect(canPlay(state, me, hedorah)).toBe(false);
    place(state, me, battleCard(), 3);
    expect(canPlay(state, me, hedorah)).toBe(true);
  });

  it("EBP01-033 8.3.1, 5.13.3: its rank counts 1 lower per zone your monster invaded this turn; it destroys every battle card", () => {
    const { state, me, opp } = setup(4);
    const card = inHand(state, me, real("EBP01-033"));
    expect(canPlay(state, me, card)).toBe(false);
    const invaded = settle(invade(state, me, invader(state, me, 2)));
    const player = self(invaded, me);
    expect(player.monsterPosition).toBe(6);
    expect(canPlay(invaded, player, card)).toBe(true);
    place(invaded, player, battleCard(), 2);
    place(invaded, opponentOf(invaded, me), battleCard(), 2);
    const after = settle(activate(invaded, player, card));
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
    expect(opp.id).toBe(opponentOf(after, me).id);
  });

  it("EBP01-058 8.2.1: rank 2 lower with a Biollante card with Evolution in your discard pile; on enter the discard pile goes back into the deck (5.3)", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 5;
    const card = inHand(state, me, real("EBP01-058"));
    expect(canPlay(state, me, card)).toBe(false);
    inDiscard(state, me, real("EBP01-048"));
    inDiscard(state, me, battleCard());
    expect(canPlay(state, me, card)).toBe(true);
    const deck = me.deck.length;
    const after = settle(play(state, me, card, 2));
    expect(self(after, me).discard).toEqual([]);
    expect(self(after, me).deck).toHaveLength(deck + 2);
  });

  it("EBP01-073 8.2: it can't be played with 7 or fewer monster cards in your discard pile", () => {
    const { state, me } = setup();
    const card = inHand(state, me, real("EBP01-073"));
    for (let i = 0; i < 7; i++) inDiscard(state, me, monsterCard(1));
    expect(canPlay(state, me, card)).toBe(false);
    inDiscard(state, me, monsterCard(1));
    expect(canPlay(state, me, card)).toBe(true);
  });

  it("EBP01-073 3.2, 3.4: when your monster invades, you may put a monster card from your discard pile under it to set the opponent's rage to 0, once", () => {
    const { state, me, opp } = setup(1);
    const card = place(state, me, real("EBP01-073"), 8);
    inDiscard(state, me, monsterCard(1));
    opp.rage = 4;
    const after = settle(invade(state, me, invader(state, me)));
    expect(opponentOf(after, me).rage).toBe(0);
    const stack = self(after, me).zones[8][0] ?? [];
    expect(stack).toHaveLength(2);
    expect(stack.at(-1)?.instanceId).toBe(card.instanceId);
  });

  it("EBP01-075 8.2.1, 12.4: with your monster in zone 8 it counts as rank 4", () => {
    const { state, me, opp } = setup(7);
    opp.monsterPosition = 4;
    const card = inHand(state, me, real("EBP01-075"));
    expect(canPlay(state, me, card)).toBe(false);
    me.monsterPosition = 8;
    expect(canPlay(state, me, card)).toBe(true);
  });

  it("EBP01-080 8.3.1: rank 2 lower while the opponent has a strategy card in play", () => {
    const { state, me, opp } = setup(4);
    const card = inHand(state, me, real("EBP01-080"));
    expect(canPlay(state, me, card)).toBe(false);
    inStrategy(state, opp, strategyCard());
    expect(canPlay(state, me, card)).toBe(true);
  });
});

describe("EBP01 deck and discard pile cards (E3, E4, E17, T3)", () => {
  it("EBP01-021 5.5: in the opponent's monster's column, look at the top 2, put any back on top, the rest to the discard pile", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 6;
    const [first, second] = stackDeck(state, me, [
      battleCard({ id: 965041 }),
      battleCard({ id: 965042 }),
    ]);
    let after = play(state, me, inHand(state, me, real("EBP01-021")), 1);
    expect(after.pendingChoice).toMatchObject({
      kind: "target",
      private: true,
    });
    after = choose(after, (id) => id === second?.instanceId);
    after = settle(choose(after, (id) => id === "done"));
    expect(self(after, me).deck[0]?.cardId).toBe(965042);
    expect(self(after, me).discard.map((c) => c.cardId)).toContain(
      first?.cardId,
    );
  });

  it("EBP01-070 5.5: look at the top card; keep it on top or send it to the discard pile", () => {
    const run = (keep: boolean) => {
      const { state, me } = setup();
      const [top] = stackDeck(state, me, [battleCard({ id: 965051 })]);
      let after = play(state, me, inHand(state, me, real("EBP01-070")), 2);
      after = settle(
        choose(after, (id) => id === (keep ? top?.instanceId : "done")),
      );
      return self(after, me);
    };
    expect(run(true).deck[0]?.cardId).toBe(965051);
    expect(run(false).discard.at(-1)?.cardId).toBe(965051);
  });

  it("EBP01-026 3.2: at the beginning of your counter phase you may put a Gigan Fest card from your discard pile under it; with a card under, +5,000", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP01-026"), 2);
    expect(getCounterPower(state, card)).toBe(7000);
    inDiscard(state, me, real("EBP01-072"));
    const after = settleUntil(pass(state), "7.4.2");
    const stack = self(after, me).zones[2][0] ?? [];
    expect(stack.map((c) => c.cardId)).toEqual([
      real("EBP01-072").id,
      card.cardId,
    ]);
    expect(getCounterPower(after, card)).toBe(12000);
  });

  it("EBP01-059 10.3.4: discarded from your hand by the opponent's effect with their monster in zones 4-8, you may play it", () => {
    const { state, me, opp } = opponentsTurn();
    while (me.hand.length > 3) me.deck.push(me.hand.pop() as CardInstance);
    const rodan = inHand(state, me, real("EBP01-059"));
    let after = activate(state, opp, inHand(state, opp, real("EBP01-079")));
    after = choose(after, (_, cardId) => cardId === rodan.cardId);
    after = settle(after);
    const tops = Object.values(zoneCardIds(self(after, me))).flat();
    expect(tops).toContain(real("EBP01-059").id);
  });

  it("EBP01-059 10.8.1: +3,000 in zone 8", () => {
    const { state, me } = setup();
    expect(getCounterPower(state, place(state, me, real("EBP01-059"), 8))).toBe(
      9000,
    );
  });

  it("EBP01-066 10.3.4: discarded from your hand by the opponent's effect, +2 rage", () => {
    const { state, me, opp } = opponentsTurn();
    while (me.hand.length > 3) me.deck.push(me.hand.pop() as CardInstance);
    const card = inHand(state, me, real("EBP01-066"));
    let after = activate(state, opp, inHand(state, opp, real("EBP01-079")));
    after = settle(choose(after, (_, cardId) => cardId === card.cardId));
    expect(self(after, me).rage).toBe(2);
  });

  it("EBP01-066 7.4.3: on the opponent's turn, 40,000 counter power doesn't counter your monster; it only moves back (Q14)", () => {
    const { state, me, opp } = opponentsTurn();
    me.monsterPosition = 7;
    inStrategy(state, me, real("EBP01-066"));
    place(state, opp, battleCard({ counterOrThreat: 40000 }), 1);
    const after = settleUntil(pass(state), "7.5.1");
    expect(logTypes(after)).toContain("counterPrevented");
    expect(self(after, me).monsterPosition).toBe(4);
  });

  it("EBP01-060 5.9: played through Evolution with 1 or fewer strategy cards in play, it activates a Godzilla vs. Destoroyah from your discard pile", () => {
    let state = runTo(atPlayTiming(), "7.3.1", 400);
    const me = turnPlayer(state);
    const opp = opponentOf(state, me);
    opp.monsterPosition = 8;
    place(state, me, real("EBP01-054"), 2);
    onDeck(state, me, real("EBP01-060"));
    inDiscard(state, me, real("EBP01-065"));
    place(state, opp, battleCard({ id: 965061 }), 3);
    state = settle(state);
    expect(zoneCardIds(self(state, me))).toEqual({
      "2": [real("EBP01-060").id],
    });
    expect(self(state, me).strategyZones[0].map((p) => p.card.cardId)).toEqual([
      real("EBP01-065").id,
    ]);
    // EBP01-065's own text resolved: the opponent's battle cards in zones 1-5 are gone.
    expect(zoneCardIds(opponentOf(state, me))).toEqual({});
  });
});

describe("EBP01 evolve-all cards (E18)", () => {
  it("EBP01-035 5.17: on enter, every rank 4 or lower battle card with Evolution in zones adjacent to it evolves, one at a time", () => {
    const { state, me } = setup(3);
    monster(state, me, godzilla(3, ["Blue"]), 3);
    place(state, me, real("EBP01-044"), 2);
    place(state, me, real("EBP01-044"), 4);
    place(state, me, real("EBP01-044"), 6); // not adjacent to zone 3
    onDeck(state, me, real("EBP01-050"));
    onDeck(state, me, real("EBP01-050"));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-035"))),
    );
    const larva = real("EBP01-050").id;
    const egg = real("EBP01-044").id;
    expect(zoneCardIds(self(after, me))).toEqual({
      "2": [larva],
      "4": [larva],
      "6": [egg],
    });
  });

  it("EBP01-036 5.17: on enter, every adjacent battle card with Evolution evolves, whatever its rank", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 8;
    monster(state, me, godzilla(4, ["Blue"]), 3);
    place(state, me, real("EBP01-054"), 2);
    onDeck(state, me, real("EBP01-060"));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-036"))),
    );
    expect(zoneCardIds(self(after, me))).toEqual({
      "2": [real("EBP01-060").id],
    });
  });

  it("EBP01-063 5.17: every rank 4 or lower battle card with Evolution evolves", () => {
    const { state, me } = setup();
    place(state, me, real("EBP01-044"), 2);
    place(state, me, real("EBP01-054"), 3); // rank 6: not evolved
    onDeck(state, me, real("EBP01-050"));
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP01-063"))),
    );
    expect(zoneCardIds(self(after, me))).toEqual({
      "2": [real("EBP01-050").id],
      "3": [real("EBP01-054").id],
    });
  });
});

describe("EBP01 move and swap cards (E9, E10)", () => {
  it("EBP01-022 5.2.1: on your turn, when your rage goes up, you may move one of your other battle cards to an unoccupied zone", () => {
    const { state, me } = setup();
    place(state, me, real("EBP01-022"), 4);
    const moving = place(state, me, battleCard({ id: 965071 }), 2);
    place(state, me, battleCard({ id: 965072 }), 3);
    let after = gainRage(state, me, inHand(state, me, monsterCard(2)));
    // Two candidates: pick one, or Done to move none (E10).
    expect(after.pendingChoice?.kind).toBe("target");
    expect(after.pendingChoice?.options.map((o) => o.id)).toContain("done");
    after = choose(after, (id) => id === moving.instanceId);
    after = settle(choose(after, (id) => id === `${me.id}:7`));
    expect(zoneCardIds(self(after, me))).toMatchObject({
      "7": [965071],
      "3": [965072],
    });
  });

  it("EBP01-057 5.6: on enter you may swap 2 of your battle cards; your rank 5 or lower battle cards adjacent to it get +3,000", () => {
    const { state, me } = setup();
    const a = place(state, me, battleCard({ id: 965081 }), 2);
    const b = place(state, me, battleCard({ id: 965082 }), 3);
    let after = play(state, me, inHand(state, me, real("EBP01-057")), 8);
    after = choose(after, (id) => id === a.instanceId);
    after = settle(choose(after, (id) => id === b.instanceId));
    expect(zoneCardIds(self(after, me))).toMatchObject({
      "2": [965082],
      "3": [965081],
    });
    // Zone 3 is adjacent to zone 8 (4.4.5.2).
    expect(getCounterPower(after, b)).toBe(1000);
    expect(getCounterPower(after, a)).toBe(4000);
  });
});

describe("EBP01-064 Godzilla vs. Megaguirus (E7)", () => {
  it("EBP01-064 10.5.2.2.1: with fewer than 4 battle cards only the first option can be chosen, so it runs at once", () => {
    const { state, me, opp } = setup();
    place(state, opp, battleCard({ id: 965091, rank: 4 }), 2);
    place(state, opp, battleCard({ id: 965092, rank: 5 }), 3);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP01-064"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [965092] });
  });

  it("EBP01-064 10.5.2.2.1: with 4 battle cards you choose; the second option destroys a chosen zone and the zones adjacent to it", () => {
    const { state, me, opp } = setup();
    for (const zone of [1, 2, 3, 4] as ZoneNumber[])
      place(state, me, battleCard(), zone);
    place(state, opp, battleCard({ id: 965101, rank: 9 }), 6);
    place(state, opp, battleCard({ id: 965102, rank: 9 }), 7);
    place(state, opp, battleCard({ id: 965103, rank: 9 }), 2);
    let after = activate(state, me, inHand(state, me, real("EBP01-064")));
    expect(after.pendingChoice).toMatchObject({ kind: "option" });
    // A paused resolution with an option choice is a valid state (spec case 52). The fixture
    // adds cards, so only the resolution invariant is checked here.
    expect(
      checkInvariants(after).filter((p) => p.startsWith("resolution")),
    ).toEqual([]);
    expect(after.pendingChoice?.options.map((o) => o.id)).toEqual(["0", "1"]);
    after = choose(after, (id) => id === "1");
    after = settle(choose(after, (id) => id === `${opp.id}:6`));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "2": [965103] });
  });
});

// ---------------------------------------------------------------------------------------------
// The M12a-2 format pieces on their own, with fixture abilities.

describe("M12a-2 format pieces", () => {
  const numbers: string[] = [];
  afterEach(() => {
    for (const n of numbers.splice(0)) setTestAbilities(n, null);
  });
  function strategyWith(
    effects: Extract<
      CardAbilities["abilities"][number],
      { kind: "triggered" }
    >["effects"],
  ) {
    const card = strategyCard();
    numbers.push(card.deckCardNumber);
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "t",
          trigger: { on: "placedInStrategyZone" },
          effects,
        },
      ],
    });
    return card;
  }
  const draw = (count: number) => ({
    effect: "draw" as const,
    player: "you" as const,
    count,
  });

  it("C1 10.5.2.3: `if` runs `then` when its condition holds and `else` otherwise", () => {
    const card = strategyWith([
      {
        effect: "if",
        condition: { rage: "you", op: ">=", value: 1 },
        then: [draw(1)],
        else: [draw(2)],
      },
      draw(1),
    ]);
    const run = (rage: number) => {
      const { state, me } = setup();
      me.rage = rage;
      const hand = me.hand.length;
      return (
        self(settle(activate(state, me, inHand(state, me, card))), me).hand
          .length - hand
      );
    };
    expect(run(1)).toBe(2);
    expect(run(0)).toBe(3);
  });

  it("E2 5.7.3: a mill from an empty deck sends nothing and doesn't reshuffle", () => {
    const card = strategyWith([{ effect: "mill", player: "you", count: 2 }]);
    const { state, me } = setup();
    me.deck = [];
    inDiscard(state, me, battleCard());
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(newLogTypes(after, state)).not.toContain("reshuffle");
    expect(self(after, me).discard).toHaveLength(1);
  });

  it("E13 5.15.1.1: moving as though countered does nothing before zone 6", () => {
    const card = strategyWith([
      { effect: "moveAsCountered", player: "opponent" },
    ]);
    const { state, me, opp } = setup();
    opp.monsterPosition = 5;
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(opponentOf(after, me).monsterPosition).toBe(5);
  });

  it("E9 5.6.2: a swap with fewer than 2 cards does nothing", () => {
    const card = strategyWith([{ effect: "swap", owner: "you" }]);
    const { state, me } = setup();
    place(state, me, battleCard({ id: 965111 }), 2);
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(zoneCardIds(self(after, me))).toEqual({ "2": [965111] });
  });

  it("E17 5.9: with no empty strategy zone, nothing is activated", () => {
    const card = strategyWith([
      {
        effect: "activate",
        from: "discard",
        filter: { owner: "you", area: "discard", type: "Strategy" },
        count: { upTo: 1 },
      },
    ]);
    const { state, me } = setup();
    // This card takes strategy zone 1; zone 2 is taken already.
    me.strategyZones[1].push({
      card: addCard(state, strategyCard(), me.id),
      placedOnTurn: state.turn,
    });
    const waiting = inDiscard(state, me, real("EBP01-032"));
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(self(after, me).discard.map((c) => c.cardId)).toContain(
      waiting.cardId,
    );
    expect(newLogTypes(after, state)).not.toContain("draw");
  });

  it("E1 5.13.1.1: an effect advance from zone 8 doesn't move and doesn't win", () => {
    const card = strategyWith([{ effect: "advance", player: "you" }]);
    const { state, me } = setup(8);
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(after.result).toBeNull();
    expect(self(after, me).monsterPosition).toBe(8);
  });
});
