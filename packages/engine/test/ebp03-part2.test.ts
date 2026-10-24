import { type Card, getCardAbilities } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import {
  advance,
  applyAction,
  type GameState,
  getCounterPower,
  getLegalActions,
  type PlayerState,
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
  play,
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

// M12c-1: EBP03 battle and strategy cards (docs/abilities/m12-plan.md), with only pieces built in
// M12a and M12b plus small extensions. One test (or more) per card, named with its rules.

const pass = (state: GameState) =>
  applyAction(state, { type: "pass", player: state.turnPlayer });

const inStrategy = (
  state: GameState,
  player: PlayerState,
  card: Card,
  zone: 0 | 1 = 0,
) =>
  player.strategyZones[zone].push({
    card: addCard(state, card, player.id),
    placedOnTurn: state.turn,
  });

function under(state: GameState, player: PlayerState, cards: Card[]) {
  player.invadingMonsterZone.unshift(
    ...cards.map((c) => addCard(state, c, player.id)),
  );
}

/** Puts `cards` under the card on top of the player's zone `zone` (3.2). */
function underZone(
  state: GameState,
  player: PlayerState,
  zone: ZoneNumber,
  cards: Card[],
) {
  const stack = player.zones[zone][0];
  if (!stack) throw new Error(`zone ${zone} is empty`);
  stack.unshift(...cards.map((c) => addCard(state, c, player.id)));
}

const base = () => real("EBP03-070");
const handIds = (state: GameState, player: PlayerState) =>
  self(state, player).hand.map((c) => c.cardId);

/** The opponent destroys all of my battle cards in zones 1-5 with EBP01-065 (an effect, 5.12). */
function opponentWipes(state: GameState, opp: PlayerState) {
  opp.monsterPosition = 6;
  return settle(activate(state, opp, inHand(state, opp, real("EBP01-065"))));
}

describe("EBP03 battle cards: counter power (10.8.1)", () => {
  it("EBP03-030 10.8.1: your Mechagodzilla battle cards in zone 8 get +3,000", () => {
    const { state, me } = setup(3);
    place(state, me, real("EBP03-030"), 1);
    const mg = place(state, me, battleCard({ traits: ["Mechagodzilla"] }), 8);
    const other = place(
      state,
      me,
      battleCard({ traits: ["Mechagodzilla"] }),
      2,
    );
    expect(getCounterPower(state, mg)).toBe(4000);
    expect(getCounterPower(state, other)).toBe(1000);
  });

  it("EBP03-037 12.4: in zone 8, [enter] gives 1 rage and it has +5,000", () => {
    const { state, me } = setup(8);
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-037")), 1),
    );
    expect(self(after, me).rage).toBe(1);
    const card = self(after, me).zones[1][0]?.at(-1);
    expect(card && getCounterPower(after, card)).toBe(10000);
  });

  it("EBP03-039 10.8.1: +5,000 with 5 strategy cards in your discard pile", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP03-039"), 1);
    for (let i = 0; i < 5; i++) inDiscard(state, me, strategyCard());
    expect(getCounterPower(state, card)).toBe(10000);
  });

  it.each(["EBP03-040", "EBP03-056"])(
    "%s 4.4.5.4: +3,000 in the opponent's monster's column",
    (number) => {
      const { state, me, opp } = setup(3);
      opp.monsterPosition = 1; // column of my zones 5 and 6
      const printed = real(number).counterOrThreat ?? 0;
      expect(getCounterPower(state, place(state, me, real(number), 5))).toBe(
        printed + 3000,
      );
      expect(getCounterPower(state, place(state, me, real(number), 1))).toBe(
        printed,
      );
    },
  );

  it("EBP03-045 4.4.5.2: +3,000 adjacent to your monster", () => {
    const { state, me } = setup(3);
    expect(getCounterPower(state, place(state, me, real("EBP03-045"), 2))).toBe(
      5000,
    );
  });

  it("EBP03-053 10.8.1: in the opponent's monster's column, +3,000 per opponent rage", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 1;
    opp.rage = 2;
    expect(getCounterPower(state, place(state, me, real("EBP03-053"), 5))).toBe(
      14000,
    );
  });

  it("EBP03-057 10.8.1: +3,000 while the opponent has no strategy cards in play", () => {
    const { state, me, opp } = setup();
    const card = place(state, me, real("EBP03-057"), 1);
    expect(getCounterPower(state, card)).toBe(5000);
    inStrategy(state, opp, strategyCard());
    expect(getCounterPower(state, card)).toBe(2000);
  });

  it("EBP03-061 12.4: +3,000 with your monster in zone 6 or beyond", () => {
    const { state, me } = setup(5);
    const card = place(state, me, real("EBP03-061"), 1);
    expect(getCounterPower(state, card)).toBe(3000);
    me.monsterPosition = 6;
    expect(getCounterPower(state, card)).toBe(6000);
  });

  it("EBP03-064 12.4: with a card under it, +3,000 at zone 4 and +3,000 more at zone 6", () => {
    const { state, me } = setup(3);
    const card = place(state, me, real("EBP03-064"), 1);
    underZone(state, me, 1, [battleCard()]);
    expect(getCounterPower(state, card)).toBe(6000);
    me.monsterPosition = 4;
    expect(getCounterPower(state, card)).toBe(9000);
    me.monsterPosition = 6;
    expect(getCounterPower(state, card)).toBe(12000);
  });

  it("EBP03-065 3.2: +3,000 with 5 cards under your monster", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP03-065"), 1);
    under(
      state,
      me,
      [1, 2, 3, 4].map(() => monsterCard(1)),
    );
    expect(getCounterPower(state, card)).toBe(7000);
    under(state, me, [monsterCard(1)]);
    expect(getCounterPower(state, card)).toBe(10000);
  });
});

describe("EBP03 battle cards: enter abilities (12.2)", () => {
  it("EBP03-030 5.2.1: on enter you may move another battle card to an unoccupied zone", () => {
    const { state, me } = setup(3);
    place(state, me, battleCard({ id: 963301 }), 2);
    let after = play(state, me, inHand(state, me, real("EBP03-030")), 1);
    // The zones offered, then Done (optional).
    expect(after.pendingChoice?.options.at(-1)?.id).toBe("done");
    after = settle(choose(after, (id) => id === `${me.id}:5`));
    expect(zoneCardIds(self(after, me))).toMatchObject({ "5": [963301] });
  });

  it("EBP03-031 5.8: on enter, look at the top card: send it to the discard pile or keep it on top", () => {
    const { state, me } = setup();
    const top = onDeck(state, me, battleCard({ id: 963311 }));
    let after = play(state, me, inHand(state, me, real("EBP03-031")), 1);
    expect(after.pendingChoice?.options.map((o) => o.id)).toContain(
      top.instanceId,
    );
    // Keep none: it goes to the discard pile.
    after = settle(choose(after, (id) => id === "done"));
    expect(self(after, me).discard.map((c) => c.cardId)).toContain(963311);
  });

  it("EBP03-033 5.8: on enter you may discard a rank 5 battle card to search for Space Beam", () => {
    const { state, me } = setup();
    me.hand = [];
    inHand(state, me, battleCard({ rank: 5 }));
    me.deck.push(addCard(state, real("EBP03-069"), me.id));
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-033")), 1),
    );
    expect(handIds(after, me)).toEqual([real("EBP03-069").id]);
  });

  it("EBP03-034 5.7: on enter you may discard a strategy card to reduce the opponent's rage by 1", () => {
    const { state, me, opp } = setup();
    me.hand = [];
    inHand(state, me, strategyCard());
    opp.rage = 2;
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-034")), 1),
    );
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EBP03-035 4.4.5.4, 5.13.1: on enter in the opponent's monster's column, you may discard a strategy card to advance your monster to zone 6", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 5; // column of my zone 1; rank 5 can be played (8.2.1)
    me.hand = [];
    inHand(state, me, strategyCard());
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-035")), 1),
    );
    expect(self(after, me).monsterPosition).toBe(6);
  });

  it("EBP03-036 C7: played from your hand into zone 8, it searches for a Moguera battle card and plays it", () => {
    const { state, me } = setup(3);
    me.deck.push(
      addCard(state, battleCard({ id: 963361, traits: ["Moguera"] }), me.id),
    );
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-036")), 8),
    );
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      963361,
    );
  });

  it("EBP03-036 C7: in another zone it doesn't", () => {
    const { state, me } = setup(3);
    me.deck.push(addCard(state, battleCard({ traits: ["Moguera"] }), me.id));
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-036")), 2),
    );
    expect(newLogTypes(after, state)).toContain("conditionNotMet");
  });

  it("EBP03-041 4.4.5.4: on enter in the opponent's monster's column with 2 rage, the opponent loses 2 rage", () => {
    const { state, me, opp } = setup(2);
    // The opponent's monster in zone 8: my zone 3 is in its column (4.4.5.4).
    me.rage = 2;
    opp.rage = 3;
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-041")), 3),
    );
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EBP03-041 10.9: when it would be destroyed, it goes to the bottom of your deck instead", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP03-041"), 2);
    const after = opponentWipes(state, opp);
    expect(self(after, me).deck.at(-1)?.cardId).toBe(real("EBP03-041").id);
    expect(newLogTypes(after, state)).toContain("replace");
  });

  it("EBP03-046 10.5.2.2.1: with your monster in zone 4 and Star Falcon in your zones, on enter choose one: the opponent loses 1 rage", () => {
    const { state, me, opp } = setup(4);
    place(state, me, real("EBP03-043"), 2);
    opp.rage = 2;
    const after = settle(
      choose(
        play(state, me, inHand(state, me, real("EBP03-046")), 1),
        (id) => id === "1",
      ),
    );
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EBP03-048 10.5.4: on enter with 2 other battle cards in your zones, the opponent loses 1 rage", () => {
    const { state, me, opp } = setup();
    place(state, me, battleCard(), 2);
    place(state, me, battleCard(), 3);
    opp.rage = 1;
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-048")), 1),
    );
    expect(opponentOf(after, me).rage).toBe(0);
  });

  it("EBP03-049 5.4, 5.7: on enter in zone 8, draw 2 then discard 2", () => {
    const { state, me } = setup(3);
    me.hand = [];
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-049")), 8),
    );
    expect(self(after, me).hand).toHaveLength(0);
    expect(self(after, me).discard).toHaveLength(2);
  });

  it.each([
    ["EBP03-050", 20000, 1],
    ["EBP03-054", 60000, 8],
  ] as const)(
    "%s 5.13.2: on enter with a [base] card in play, an opponent monster with %i or less threat retreats 1",
    (number, maxThreat, zone) => {
      // The opponent's monster in a zone at least the card's rank, so it can be played (8.2.1).
      const at = (real(number).rank ?? 0) as ZoneNumber;
      const run = (threat: number) => {
        const { state, me, opp } = setup(3);
        inStrategy(state, me, base());
        monster(state, opp, monsterCard(2, { counterOrThreat: threat }), at);
        const after = settle(
          play(state, me, inHand(state, me, real(number)), zone as ZoneNumber),
        );
        return opponentOf(after, me).monsterPosition;
      };
      expect(run(maxThreat)).toBe(at - 1);
      expect(run(maxThreat + 1000)).toBe(at);
    },
  );

  it("EBP03-054: without zone 8 it doesn't", () => {
    const { state, me, opp } = setup(3);
    inStrategy(state, me, base());
    monster(state, opp, monsterCard(2), 8);
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-054")), 1),
    );
    expect(opponentOf(after, me).monsterPosition).toBe(8);
  });

  it("EBP03-052 3.2: with your monster in zone 6 and nothing under it, on enter it searches for Land Moguera and Star Falcon and puts them under it", () => {
    const { state, me } = setup(6);
    me.deck.push(addCard(state, real("EBP03-046"), me.id));
    me.deck.push(addCard(state, real("EBP03-043"), me.id));
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-052")), 1),
    );
    expect(
      self(after, me).zones[1][0]?.map((c) => after.cards[c.cardId]?.name),
    ).toEqual(["Land Moguera", "Star Falcon", "M.O.G.U.E.R.A."]);
  });

  it("EBP03-052 5.12: destroyed by the opponent's effect, the cards under it go to your hand", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP03-052"), 2);
    underZone(state, me, 2, [
      battleCard({ id: 963521 }),
      battleCard({ id: 963522 }),
    ]);
    const after = opponentWipes(state, opp);
    expect(handIds(after, me)).toEqual(
      expect.arrayContaining([963521, 963522]),
    );
    expect(self(after, me).discard.map((c) => c.cardId)).toEqual([
      real("EBP03-052").id,
    ]);
  });

  it("EBP03-053 M1: while the opponent has 0 rage, the opponent's effects can't destroy it", () => {
    const run = (oppRage: number) => {
      const { state, me, opp } = opponentsTurn();
      place(state, me, real("EBP03-053"), 2);
      opp.rage = oppRage;
      return Object.keys(zoneCardIds(self(opponentWipes(state, opp), me)));
    };
    expect(run(0)).toEqual(["2"]);
    expect(run(1)).toEqual([]);
  });

  it("EBP03-055 5.2.1: on enter you may put up to 1 Mothra battle card from your discard pile on top of your deck", () => {
    const { state, me } = setup();
    inDiscard(state, me, battleCard({ id: 963551, traits: ["Mothra"] }));
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-055")), 1),
    );
    expect(self(after, me).deck[0]?.cardId).toBe(963551);
  });

  it("EBP03-057 C6: on enter with 3 unoccupied opponent zones, destroys 1 of their strategy cards", () => {
    const { state, me, opp } = setup();
    inStrategy(state, opp, strategyCard());
    const after = settle(
      play(state, me, inHand(state, me, real("EBP03-057")), 1),
    );
    expect(opponentOf(after, me).strategyZones.flat()).toEqual([]);
  });

  it("EBP03-064 5.12, 3.2: on enter, after an opponent battle card was destroyed this turn, you may put a battle card from your discard pile under it", () => {
    const { state, me, opp } = setup();
    place(state, opp, battleCard({ rank: 1 }), 1);
    inDiscard(state, me, battleCard());
    // My EBP03-072 Petit Railgun destroys the card in my monster's column first.
    opp.monsterPosition = 8;
    me.monsterPosition = 5; // column of the opponent's zone 1
    let after = settle(
      applyAction(state, {
        type: "activateStrategy",
        player: me.id,
        cardInstanceId: inHand(state, me, real("EBP03-072")).instanceId,
        strategyZone: 1,
      }),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
    after = settle(
      play(
        after,
        self(after, me),
        inHand(after, self(after, me), real("EBP03-064")),
        2,
      ),
    );
    expect(self(after, me).zones[2][0]).toHaveLength(2);
  });
});

describe("EBP03 battle cards: phase abilities (7.4.1, 7.5.1)", () => {
  it("EBP03-032 7.4.1, 10.8.2: adjacent to your monster, you may discard your hand for +1,000 per card this turn", () => {
    const { state, me } = setup(3);
    const card = place(state, me, real("EBP03-032"), 2);
    me.hand = [];
    for (let i = 0; i < 3; i++) inHand(state, me, battleCard());
    const after = settleUntil(pass(state), "7.4.2");
    expect(self(after, me).hand).toEqual([]);
    expect(getCounterPower(after, card)).toBe(6000);
    // The bonus ends with the turn (7.5.6).
    expect(getCounterPower(settleUntil(after, "7.5.7"), card)).toBe(3000);
  });

  it("EBP03-038 7.4.1: with the opponent at 2 rage, at your counter phase it destroys your battle cards adjacent to it", () => {
    const { state, me, opp } = setup(6);
    place(state, me, real("EBP03-038"), 2);
    place(state, me, battleCard(), 1);
    place(state, me, battleCard(), 3);
    place(state, me, battleCard({ id: 963381 }), 5);
    opp.rage = 2;
    const after = settleUntil(pass(state), "7.4.2");
    expect(zoneCardIds(self(after, me))).toMatchObject({ "5": [963381] });
    expect(Object.keys(zoneCardIds(self(after, me)))).toEqual(["2", "5"]);
  });

  it("EBP03-039 7.2.3: whenever your card goes from a strategy zone to the discard pile, draw 1", () => {
    const run = (withCard: boolean) => {
      const { state, me } = opponentsTurn();
      if (withCard) place(state, me, real("EBP03-039"), 2);
      inStrategy(state, me, strategyCard());
      // My strategy card leaves at my next start phase (7.2.3); the draw resolves at the 7.2.5
      // check timing.
      const after = settleUntil(pass(state), "7.3.1");
      expect(after.turnPlayer).toBe(me.id);
      expect(logTypes(after)).toContain("discardStrategy");
      return self(after, me).hand.length;
    };
    expect(run(true)).toBe(run(false) + 1);
  });

  it("EBP03-040 7.4.1: at your counter phase you may move it to an unoccupied zone", () => {
    const { state, me } = setup(3);
    place(state, me, real("EBP03-040"), 2);
    let after = advance(settleUntil(pass(state), "7.4.1"));
    after = settle(choose(after, (id) => id === `${me.id}:5`));
    expect(zoneCardIds(self(after, me))).toEqual({
      "5": [real("EBP03-040").id],
    });
  });

  it("EBP03-047 E18: at your counter phase in the opponent's monster's column, you may discard a Weapon battle card to play Super Mechagodzilla on top of it", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 1;
    place(state, me, real("EBP03-047"), 5);
    me.hand = [];
    inHand(state, me, battleCard({ traits: ["Weapon"] }));
    me.deck.push(addCard(state, real("EBP03-053"), me.id));
    const after = settleUntil(pass(state), "7.4.2");
    expect(
      self(after, me).zones[5][0]?.map((c) => after.cards[c.cardId]?.name),
    ).toEqual(["Garuda", "Super Mechagodzilla"]);
  });

  it("EBP03-043 E4, E18: with your monster in zone 4, at your counter phase it goes under Land Moguera, then a Moguera battle card is played on top of Land Moguera", () => {
    const { state, me } = setup(4);
    place(state, me, real("EBP03-043"), 1);
    place(state, me, real("EBP03-046"), 2);
    me.deck.push(addCard(state, real("EBP03-052"), me.id));
    const after = settleUntil(pass(state), "7.4.2");
    expect(zoneCardIds(self(after, me))).toEqual({
      "2": [real("EBP03-052").id],
    });
    expect(
      self(after, me).zones[2][0]?.map((c) => after.cards[c.cardId]?.name),
    ).toEqual(["Star Falcon", "Land Moguera", "M.O.G.U.E.R.A."]);
  });

  it("EBP03-058 4.4.5.2, 5.2.1: at your end phase it moves to a zone beside it in its row, then is destroyed if adjacent to your monster", () => {
    const run = (position: ZoneNumber) => {
      const { state, me } = setup(position);
      place(state, me, real("EBP03-058"), 1);
      return zoneCardIds(self(settleUntil(pass(state), "7.5.2"), me));
    };
    // From zone 1 only zone 2 is beside it; with the monster in zone 6 it stays.
    expect(run(6)).toEqual({ "2": [real("EBP03-058").id] });
    // With the monster in zone 3, zone 2 is adjacent to it: destroyed.
    expect(run(3)).toEqual({});
  });

  it("EBP03-058 C3: from zone 7 the zones beside it are 6 and 8, not 4 (behind it)", () => {
    const { state, me } = setup(2);
    place(state, me, real("EBP03-058"), 7);
    const after = advance(settleUntil(pass(state), "7.5.1"));
    expect(after.pendingChoice?.options.map((o) => o.id)).toEqual([
      `${me.id}:6`,
      `${me.id}:8`,
    ]);
  });
});

describe("EBP03 battle cards: other triggers", () => {
  it("EBP03-042 T6, 5.17: when your monster invades with it in zone 8, you may put it under a Mothra battle card with Evolution, which then evolves", () => {
    const { state, me } = setup(1);
    place(state, me, real("EBP03-042"), 8);
    place(state, me, real("EBP03-044"), 3);
    me.deck.push(
      addCard(
        state,
        battleCard({ id: 963421, traits: ["Mothra"], rank: 7 }),
        me.id,
      ),
    );
    const after = settle(invade(state, me, invader(state, me)));
    expect(self(after, me).zones[3][0]?.map((c) => c.cardId)).toEqual([
      real("EBP03-042").id,
      real("EBP03-044").id,
      963421,
    ]);
    expect(self(after, me).zones[8]).toEqual([]);
  });

  it("EBP03-059 12.7.2: destroyed, return up to 1 King Ghidorah monster card", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP03-059"), 2);
    inDiscard(
      state,
      me,
      monsterCard(2, { id: 963591, traits: ["King Ghidorah"] }),
    );
    expect(handIds(opponentWipes(state, opp), me)).toContain(963591);
  });

  it("EBP03-060 12.7.2: destroyed, the opponent loses 1 rage", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP03-060"), 2);
    opp.rage = 2;
    expect(opponentOf(opponentWipes(state, opp), me).rage).toBe(1);
  });

  it("EBP03-061 T3, 8.6.1: discarded from your hand for your invasion, you may play it from your discard pile", () => {
    const { state, me } = setup(1);
    me.hand = [];
    const dagahra = inHand(state, me, real("EBP03-061"));
    const after = settle(invade(state, me, dagahra));
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      real("EBP03-061").id,
    );
  });

  it("EBP03-062 T6, 12.7.2: when the opponent's monster invades it is destroyed, then returns a Sacred Guardian Beasts monster card", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP03-062"), 2);
    inDiscard(
      state,
      me,
      monsterCard(1, { id: 963621, traits: ["Sacred Guardian Beasts"] }),
    );
    opp.monsterPosition = 1;
    const after = settle(invade(state, opp, invader(state, opp)));
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(handIds(after, me)).toContain(963621);
  });

  it("EBP03-063 T7, 12.4: on your turn with your monster in zone 4, when you play a monster card you may play it from your discard pile", () => {
    const { state, me } = setup(4);
    monster(state, me, monsterCard(1), 4);
    inDiscard(state, me, real("EBP03-063"));
    const after = settle(
      playMonster(state, me, inHand(state, me, monsterCard(1))),
    );
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      real("EBP03-063").id,
    );
  });

  it("EBP03-063 12.4: with your monster in zone 3 it stays in the discard pile", () => {
    const { state, me } = setup(3);
    monster(state, me, monsterCard(1), 3);
    inDiscard(state, me, real("EBP03-063"));
    const after = settle(
      playMonster(state, me, inHand(state, me, monsterCard(1))),
    );
    expect(zoneCardIds(self(after, me))).toEqual({});
  });

  it("EBP03-066 8.2.1: with the opponent at 2 strategy cards in play it can be played 2 ranks lower; on enter it destroys 1 of their strategy cards", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 6;
    const card = inHand(state, me, real("EBP03-066"));
    const canPlay = (s: GameState) =>
      getLegalActions(s, me.id).some(
        (a) => a.type === "playBattle" && a.cardInstanceId === card.instanceId,
      );
    inStrategy(state, opp, strategyCard(), 0);
    expect(canPlay(state)).toBe(false);
    inStrategy(state, opp, strategyCard(), 1);
    expect(canPlay(state)).toBe(true);
    const after = settle(play(state, me, card, 1));
    expect(opponentOf(after, me).strategyZones.flat()).toHaveLength(1);
  });
});

describe("EBP03 strategy cards", () => {
  it("EBP03-069 5.7.2, 5.12: the opponent discards down to 4; with a Mechagodzilla card in zone 8, their rank 5 or lower battle cards are destroyed", () => {
    const run = (withMg: boolean) => {
      const { state, me, opp } = setup(4);
      opp.hand = [];
      for (let i = 0; i < 6; i++) inHand(state, opp, battleCard());
      if (withMg)
        place(state, me, battleCard({ traits: ["Mechagodzilla"] }), 8);
      opp.monsterPosition = 6;
      place(state, opp, battleCard({ rank: 5 }), 1);
      const after = settle(
        activate(state, me, inHand(state, me, real("EBP03-069"))),
      );
      return {
        hand: opponentOf(after, me).hand.length,
        zones: Object.keys(zoneCardIds(opponentOf(after, me))),
      };
    };
    expect(run(true)).toEqual({ hand: 4, zones: [] });
    expect(run(false)).toEqual({ hand: 4, zones: ["1"] });
  });

  it("EBP03-072 4.4.5.4: destroys every opponent battle card in your monster's column", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 6;
    place(state, opp, battleCard(), 3);
    place(state, opp, battleCard(), 8);
    place(state, opp, battleCard({ id: 963721 }), 2);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-072"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "2": [963721] });
  });

  it("EBP03-073 5.10, C3: reveals 3 into the discard pile; destroys opponent battle cards in zones numbered like their ranks; their monster in one of them retreats 1", () => {
    const { state, me, opp } = setup(4);
    me.hand = [];
    for (const rank of [2, 4, 9].reverse())
      onDeck(state, me, battleCard({ rank }));
    opp.monsterPosition = 4;
    place(state, opp, battleCard(), 2);
    place(state, opp, battleCard({ id: 963731 }), 5);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-073"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "5": [963731] });
    expect(opponentOf(after, me).monsterPosition).toBe(3);
  });

  it("EBP03-074 5.11.2, Q27: with a rank III or lower monster, plays a monster card one rank higher sharing a trait from your monster deck, on top; no rage, and the turn's monster play is still there", () => {
    const { state, me } = setup(6);
    monster(state, me, monsterCard(2, { traits: ["Mothra"] }), 6);
    me.monsterDeck = [
      addCard(state, monsterCard(3, { id: 963741, traits: ["Mothra"] }), me.id),
      addCard(state, monsterCard(3, { id: 963742, traits: ["Other"] }), me.id),
    ];
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-074"))),
    );
    expect(self(after, me).invadingMonsterZone.map((c) => c.cardId)).toEqual([
      expect.any(Number),
      963741,
    ]);
    expect(self(after, me).monsterPosition).toBe(6);
    expect(self(after, me).rage).toBe(0);
    expect(after.turnFlags.monsterPlayed).toBe(false);
  });

  it("EBP03-074: with a rank IV monster nothing happens", () => {
    const { state, me } = setup(6);
    monster(state, me, monsterCard(4, { traits: ["Mothra"] }), 6);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-074"))),
    );
    expect(newLogTypes(after, state)).toContain("conditionNotMet");
  });

  it("EBP03-077 10.5.2.2.1: choose one: return a rank II or lower monster card; the second option needs 5 cards under your monster", () => {
    const { state, me } = setup(4);
    inDiscard(state, me, monsterCard(2, { id: 963771 }));
    inDiscard(state, me, monsterCard(4, { id: 963772 }));
    let after = activate(state, me, inHand(state, me, real("EBP03-077")));
    // Only the first option can apply (no cards under the monster): it runs at once.
    after = settle(after);
    expect(handIds(after, me)).toContain(963771);
    expect(handIds(after, me)).not.toContain(963772);
  });

  it("EBP03-077: with 5 cards under your monster, the second option returns any monster card", () => {
    const { state, me } = setup(4);
    under(
      state,
      me,
      [1, 2, 3, 4, 5].map(() => monsterCard(1)),
    );
    inDiscard(state, me, monsterCard(4, { id: 963773 }));
    const after = settle(
      choose(
        activate(state, me, inHand(state, me, real("EBP03-077"))),
        (id) => id === "1",
      ),
    );
    expect(handIds(after, me)).toContain(963773);
  });

  it("EBP03-079 5.6: sets the opponent's rage to 0", () => {
    const { state, me, opp } = setup(7);
    opp.rage = 4;
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP03-079"))),
    );
    expect(opponentOf(after, me).rage).toBe(0);
    expect(logTypes(after)).toContain("rageChanged");
  });
});

describe("EBP03 data", () => {
  it("every card is implemented except the 14 that wait for M12c-2", () => {
    const manual = Array.from(
      { length: 80 },
      (_, i) => `EBP03-${String(i + 1).padStart(3, "0")}`,
    ).filter((n) => getCardAbilities(n).status !== "implemented");
    expect(manual).toEqual(
      [4, 6, 13, 18, 24, 51, 67, 68, 70, 71, 75, 76, 78, 80].map(
        (n) => `EBP03-${String(n).padStart(3, "0")}`,
      ),
    );
  });
});
