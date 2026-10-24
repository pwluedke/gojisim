import {
  type Card,
  type CardAbilities,
  getCardAbilities,
} from "@gojisim/cards";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyAction,
  type CardInstance,
  counterPowerOf,
  createGame,
  type GameState,
  getCounterPower,
  getLegalActions,
  getThreat,
  type PlayerState,
  type ZoneNumber,
} from "../src";
import { setTestAbilities } from "../src/testing";
import { testGameOptions } from "./fixtures/cards";
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
  newGame,
  nonTurnPlayer,
  runTo,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";

// M12b-1: EBP02 cards that need neither tokens nor Revenge (docs/abilities/m12-plan.md: C3, T7,
// E11, E19, K3, CU and small extensions). One test (or more) per card, named with its rules.

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

/** Cards under the player's monster, bottom first (3.2). */
function under(state: GameState, player: PlayerState, cards: Card[]) {
  player.invadingMonsterZone.unshift(
    ...cards.map((c) => addCard(state, c, player.id)),
  );
}

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

const kg = () => monsterCard(1, { traits: ["King Ghidorah"] });

describe("EBP02 keywords and cards with no text", () => {
  it.each([
    ["EBP02-003", 3],
    ["EBP02-004", 2],
    ["EBP02-007", 3],
    ["EBP02-008", 4],
    ["EBP02-009", 3],
  ] as const)("%s 12.5.1: Burst rank %i", (number, rank) => {
    expect(getCardAbilities(number).abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "burst", rank },
    });
  });

  it.each([
    ["EBP02-030", 5, "Little Godzilla"],
    ["EBP02-032", 7, "Biollante"],
  ] as const)(
    "%s 12.6.1: Evolution rank %i, trait %s",
    (number, rank, trait) => {
      expect(getCardAbilities(number).abilities).toContainEqual({
        kind: "keyword",
        keyword: { name: "evolution", rank, trait },
      });
    },
  );

  it("EBP02-063 10.1: implemented with no abilities", () => {
    expect(getCardAbilities("EBP02-063")).toMatchObject({
      status: "implemented",
      abilities: [],
    });
  });

  it("EBP02-031 6.1.1.4: any number of copies (Q13)", () => {
    expect(getCardAbilities("EBP02-031").deckRules).toEqual([
      { rule: "anyNumber" },
    ]);
  });
});

describe("EBP02 counter power and threat (10.8.1)", () => {
  it("EBP02-011 +3,000 with 2 or more rage", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP02-011"), 2);
    me.rage = 2;
    expect(getCounterPower(state, card)).toBe(5000);
  });

  it("EBP02-015 4.4.3: +3,000 in the zone with the number of the opponent's monster's zone (C3)", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 3;
    expect(getCounterPower(state, place(state, me, real("EBP02-015"), 3))).toBe(
      7000,
    );
    expect(getCounterPower(state, place(state, me, real("EBP02-015"), 2))).toBe(
      4000,
    );
  });

  it("EBP02-016 4.4.5.4: +5,000 in the opponent's monster's column", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 1;
    expect(getCounterPower(state, place(state, me, real("EBP02-016"), 5))).toBe(
      12000,
    );
  });

  it("EBP02-021 4.4.5.2: your rank 5 or lower battle cards adjacent to it get +3,000", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP02-021"), 3);
    expect(
      getCounterPower(state, place(state, me, battleCard({ rank: 5 }), 2)),
    ).toBe(4000);
    expect(
      getCounterPower(state, place(state, me, battleCard({ rank: 6 }), 4)),
    ).toBe(1000);
  });

  it("EBP02-031 10.8.1: +3,000 with 2 other rank 5 or lower battle cards", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP02-031"), 1);
    place(state, me, battleCard({ rank: 5 }), 2);
    expect(getCounterPower(state, card)).toBe(2000);
    place(state, me, battleCard({ rank: 1 }), 3);
    expect(getCounterPower(state, card)).toBe(5000);
  });

  it.each([
    ["EBP02-033", 4],
    ["EBP02-066", 6],
  ] as const)(
    "%s 12.4: +3,000 with its monster in zone %i or beyond",
    (number, zone) => {
      const { state, me } = setup((zone - 1) as ZoneNumber);
      const card = place(state, me, real(number), 1);
      const printed = real(number).counterOrThreat ?? 0;
      expect(getCounterPower(state, card)).toBe(printed);
      me.monsterPosition = zone;
      expect(getCounterPower(state, card)).toBe(printed + 3000);
    },
  );

  it.each(["EBP02-034", "EBP02-061"])(
    "%s 10.8.1: +3,000 in zone 8",
    (number) => {
      const { state, me } = setup();
      const printed = real(number).counterOrThreat ?? 0;
      expect(getCounterPower(state, place(state, me, real(number), 8))).toBe(
        printed + 3000,
      );
    },
  );

  it("EBP02-041 4.4.5.2: your battle cards adjacent to it get +1,000", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP02-041"), 3);
    expect(getCounterPower(state, place(state, me, battleCard(), 8))).toBe(
      2000,
    );
  });

  it("EBP02-043 3.2: adjacent battle cards get +1,000 per card under it", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP02-043"), 3);
    under(state, me, [monsterCard(1), monsterCard(2)]);
    expect(getCounterPower(state, place(state, me, battleCard(), 2))).toBe(
      3000,
    );
  });

  it("EBP02-065 12.4, 3.2: +5,000 with 3 cards under your monster, +5,000 more with 5", () => {
    const { state, me } = setup(6);
    const card = place(state, me, real("EBP02-065"), 2);
    under(state, me, [monsterCard(1), monsterCard(1), monsterCard(1)]);
    expect(getCounterPower(state, card)).toBe(10000);
    under(state, me, [monsterCard(1), monsterCard(1)]);
    expect(getCounterPower(state, card)).toBe(15000);
  });

  it("EBP02-067 10.8.1: +5,000 while the opponent has a Godzilla card in their zones", () => {
    const { state, me, opp } = setup();
    const card = place(state, me, real("EBP02-067"), 2);
    place(state, opp, battleCard({ traits: ["Godzilla"] }), 2);
    expect(getCounterPower(state, card)).toBe(15000);
  });

  it("EBP02-076 4.4.5.2: +3,000 adjacent to your monster", () => {
    const { state, me } = setup(3);
    expect(getCounterPower(state, place(state, me, real("EBP02-076"), 8))).toBe(
      6000,
    );
  });

  it("EBP02-002 10.8.1: +5,000 threat with a strategy card in play", () => {
    const { state, me } = setup();
    monster(state, me, real("EBP02-002"), 2);
    expect(getThreat(state, me.id)).toBe(11000);
    inStrategy(state, me, strategyCard());
    expect(getThreat(state, me.id)).toBe(16000);
  });

  it("EBP02-023 10.8.1: +10,000 threat with 10 monster cards in the discard pile", () => {
    const { state, me } = setup();
    monster(state, me, real("EBP02-023"), 2);
    for (let i = 0; i < 10; i++) inDiscard(state, me, monsterCard(1));
    expect(getThreat(state, me.id)).toBe(44000);
  });

  it("EBP02-045 10.8.1: +3,000 threat per rank of the opponent's monster", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP02-045"), 2);
    monster(state, opp, monsterCard(3), 4);
    expect(getThreat(state, me.id)).toBe(11000 + 9000);
  });

  it("EBP02-051 10.8.1: with 5 cards under it, +3,000 threat per unoccupied opponent zone", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP02-051"), 2);
    under(state, me, [kg(), kg(), kg(), kg(), kg()]);
    opp.monsterPosition = 8;
    place(state, opp, battleCard(), 1);
    // 8 zones minus zone 1 (a card) minus zone 8 (their monster) = 6.
    expect(getThreat(state, me.id)).toBe(37000 + 18000);
  });

  it("EBP02-017 7.4.2: +5,000 total counter power on your turn with 4 battle cards", () => {
    const { state, me } = setup();
    inStrategy(state, me, real("EBP02-017"));
    for (const zone of [1, 2, 3, 4] as ZoneNumber[])
      place(state, me, battleCard(), zone);
    expect(counterPowerOf(state, me)).toBe(4000 + 5000);
  });
});

describe("EBP02 Godzilla (2016) forms (3.2: cards under the monster)", () => {
  it("EBP02-001 7.4.1: at the beginning of the opponent's counter phase you may discard a strategy card for 1 rage", () => {
    const { state, me } = opponentsTurn();
    monster(state, me, real("EBP02-001"), 2);
    inHand(state, me, strategyCard());
    const after = settleUntil(pass(state), "7.4.2");
    expect(self(after, me).rage).toBe(1);
  });

  it("EBP02-003 5.13.1: on enter with Giant Unknown Creature under it, you may discard a strategy card to advance 1", () => {
    const { state, me } = setup(3);
    monster(state, me, godzilla(2), 3);
    under(state, me, [real("EBP02-001")]);
    inHand(state, me, strategyCard());
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP02-003"))),
    );
    expect(self(after, me).monsterPosition).toBe(4);
  });

  it("EBP02-004 5.12: on enter with a 2nd Form under it, destroys 1 rank 6 or lower battle card per strategy card in your strategy zones (C6)", () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(3), 2);
    under(state, me, [real("EBP02-002")]);
    inStrategy(state, me, strategyCard(), 0);
    inStrategy(state, me, strategyCard(), 1);
    for (const zone of [1, 2, 3] as ZoneNumber[])
      place(state, opp, battleCard({ rank: 6 }), zone);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP02-004"))),
    );
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toHaveLength(1);
  });

  it("EBP02-005 3.4: on your turn in zone 6 or beyond, when its rage goes up with a strategy card in play, the opponent discards down to 3", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP02-005"), 6);
    inStrategy(state, me, strategyCard());
    while (opp.hand.length < 6) inHand(state, opp, battleCard());
    const after = settle(
      gainRage(state, me, inHand(state, me, monsterCard(2))),
    );
    expect(opponentOf(after, me).hand).toHaveLength(3);
  });

  it("EBP02-006 12.3: when invading with a 3rd Form under it, destroys every opponent rank 6 or lower battle card", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP02-006"), 1);
    under(state, me, [real("EBP02-004")]);
    place(state, opp, battleCard({ id: 966001, rank: 6 }), 2);
    place(state, opp, battleCard({ id: 966002, rank: 7 }), 3);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [966002] });
  });

  it("EBP02-006 10.8.1: with a 4th Form under it, +10,000 threat per strategy card in your strategy zones", () => {
    const { state, me } = setup();
    monster(state, me, real("EBP02-006"), 2);
    under(state, me, [real("EBP02-007")]);
    inStrategy(state, me, strategyCard(), 0);
    inStrategy(state, me, strategyCard(), 1);
    expect(getThreat(state, me.id)).toBe(33000 + 20000);
  });

  it("EBP02-007 5.10: on enter you may discard a strategy card to reveal the top 5, take 1 monster card, and discard the rest", () => {
    const { state, me } = setup();
    monster(state, me, godzilla(4), 2);
    inHand(state, me, strategyCard());
    const cards = stackDeck(state, me, [
      battleCard(),
      monsterCard(1, { id: 966011 }),
      battleCard(),
      battleCard(),
      battleCard(),
    ]);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP02-007"))),
    );
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(966011);
    // 4 revealed cards plus the strategy card paid.
    expect(self(after, me).discard).toHaveLength(5);
    expect(cards).toHaveLength(5);
  });
});

describe("EBP02 rage and zone triggers", () => {
  it("EBP02-008 4.4.3: when its rage goes up, destroys the opponent's rank 6 or lower battle cards in the zone with its zone's number (C3)", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP02-008"), 3);
    place(state, opp, battleCard({ id: 966021, rank: 6 }), 3);
    place(state, opp, battleCard({ id: 966022, rank: 6 }), 4);
    const after = settle(
      gainRage(state, me, inHand(state, me, monsterCard(2))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "4": [966022] });
  });

  it("EBP02-009 12.5.2: discarded by Burst, it returns to your hand", () => {
    const { state, me } = setup(2);
    monster(state, me, godzilla(3), 2);
    const after = settleUntil(
      pass(
        settle(playMonster(state, me, inHand(state, me, real("EBP02-009")))),
      ),
      "7.5.2",
    );
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(
      real("EBP02-009").id,
    );
    expect(newLogTypes(after, state)).toContain("burstDiscard");
  });

  it("EBP02-009 12.3: when invading, the opponent discards down to 3", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP02-009"), 1);
    while (opp.hand.length < 6) inHand(state, opp, battleCard());
    expect(
      opponentOf(settle(invade(state, me, invader(state, me))), me).hand,
    ).toHaveLength(3);
  });

  it("EBP02-042 3.4: on enter you may discard a King Ghidorah or Megalon card to reduce the opponent's rage by 2; at your end phase, +1 rage with their monster in zones 1-5", () => {
    const { state, me, opp } = setup();
    monster(state, me, monsterCard(2, { traits: ["Gigan"] }), 2);
    inHand(state, me, battleCard({ traits: ["Megalon"] }));
    opp.rage = 3;
    opp.monsterPosition = 4;
    let after = settle(
      playMonster(state, me, inHand(state, me, real("EBP02-042"))),
    );
    expect(opponentOf(after, me).rage).toBe(1);
    const rage = self(after, me).rage;
    after = settleUntil(pass(after), "7.5.2");
    expect(self(after, me).rage).toBe(rage + 1);
  });

  it("EBP02-044 12.3: when invading with the opponent's monster in zones 6-8, their rage -2; at your end phase with it in zones 1-5, +2 rage", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP02-044"), 1);
    opp.monsterPosition = 6;
    opp.rage = 2;
    expect(
      opponentOf(settle(invade(state, me, invader(state, me))), me).rage,
    ).toBe(0);
    const second = setup(1);
    monster(second.state, second.me, real("EBP02-044"), 1);
    second.opp.monsterPosition = 4;
    expect(self(settleUntil(pass(second.state), "7.5.2"), second.me).rage).toBe(
      2,
    );
  });

  it("EBP02-074 3.4: +1 rage per rank of the opponent's monster", () => {
    const { state, me, opp } = setup(7);
    monster(state, opp, monsterCard(3), 8);
    expect(
      self(
        settle(activate(state, me, inHand(state, me, real("EBP02-074")))),
        me,
      ).rage,
    ).toBe(3);
  });

  it("EBP02-075 3.4: on enter with Chibi Mechagodzilla in your zones, the opponent loses 1 rage", () => {
    const { state, me, opp } = setup();
    place(state, me, real("EBP02-076"), 2);
    opp.rage = 2;
    expect(
      opponentOf(
        settle(play(state, me, inHand(state, me, real("EBP02-075")), 3)),
        me,
      ).rage,
    ).toBe(1);
  });
});

describe("EBP02 monster moves (E1)", () => {
  it("EBP02-013 5.13.1.2: on enter with 2 or more rage, your monster advances to zone 5", () => {
    const { state, me } = setup(2);
    me.rage = 2;
    expect(
      self(settle(play(state, me, inHand(state, me, real("EBP02-013")), 8)), me)
        .monsterPosition,
    ).toBe(5);
  });

  it("EBP02-014 5.7.3: on enter it mills 1; a monster card advances your monster to zone 6", () => {
    const { state, me } = setup(2);
    onDeck(state, me, monsterCard(1));
    expect(
      self(settle(play(state, me, inHand(state, me, real("EBP02-014")), 8)), me)
        .monsterPosition,
    ).toBe(6);
  });

  it("EBP02-023 5.13.2: on enter with 5 monster cards in your discard pile, an opponent monster with 50,000 or less threat retreats 1", () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(4, ["Blue"]), 2);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    opp.monsterPosition = 6;
    expect(
      opponentOf(
        settle(playMonster(state, me, inHand(state, me, real("EBP02-023")))),
        me,
      ).monsterPosition,
    ).toBe(5);
  });

  it("EBP02-036 5.13.2: at your end phase, adjacent to your monster, an opponent monster with 40,000 or less threat retreats 1", () => {
    const { state, me, opp } = setup(3);
    place(state, me, real("EBP02-036"), 2);
    opp.monsterPosition = 6;
    opp.rage = 1; // 11,000 threat: no counter by its 6,000 (7.4.3)
    expect(
      opponentOf(settleUntil(pass(state), "7.5.2"), me).monsterPosition,
    ).toBe(5);
  });

  it("EBP02-047 5.7.3: whenever it advances, it mills 1", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP02-047"), 1);
    const after = settle(invade(state, me, invader(state, me)));
    expect(newLogTypes(after, state)).toContain("mill");
  });

  it("EBP02-024 6.3.1.6: in your monster deck, it starts the game in zone 5 (K3, Q31); it never advances or invades (M1)", () => {
    const options = testGameOptions(7);
    const [p1] = options.players;
    p1.monsterDeck = [
      real("EBP02-024"),
      ...p1.monsterDeck.filter((c) => c.rank !== 1),
    ];
    const state = createGame(options);
    const alice = state.players.find((p) => p.id === p1.id) as PlayerState;
    expect(alice.monsterPosition).toBe(5);
    expect(
      state.log.find(
        (e) => e.type === "setInvadingMonster" && e.player === p1.id,
      )?.payload["zone"],
    ).toBe(5);
    const played = runTo(state, "7.3.2");
    const me = played.players.find((p) => p.id === p1.id) as PlayerState;
    if (played.turnPlayer === me.id)
      expect(
        getLegalActions(played, me.id).some((a) => a.type === "invade"),
      ).toBe(false);
    // The 7.5.2 advance doesn't move it.
    const later = runTo(played, "7.2.1");
    expect(later.players.find((p) => p.id === p1.id)?.monsterPosition).toBe(5);
  });
});

describe("EBP02 battle card moves and swaps (E9, E10)", () => {
  it("EBP02-010 5.2.1: on enter, one of your other battle cards moves to an unoccupied zone", () => {
    const { state, me } = setup();
    const other = place(state, me, battleCard({ id: 966031 }), 2);
    const after = settle(
      play(state, me, inHand(state, me, real("EBP02-010")), 3),
    );
    const zones = zoneCardIds(self(after, me));
    expect(zones["2"]).toBeUndefined();
    expect(Object.values(zones).flat()).toContain(other.cardId);
  });

  it("EBP02-019 5.2.1, 8.6: move a battle card to an unoccupied zone; if you invaded this turn, your monster advances 1 (C2)", () => {
    const { state, me } = setup(3);
    place(state, me, battleCard(), 1);
    const invaded = settle(invade(state, me, invader(state, me)));
    const player = self(invaded, me);
    const after = settle(
      activate(invaded, player, inHand(invaded, player, real("EBP02-019"))),
    );
    expect(self(after, me).monsterPosition).toBe(5);
  });

  it("EBP02-069 5.6: swaps two of the opponent's battle cards", () => {
    const { state, me, opp } = setup();
    place(state, opp, battleCard({ id: 966041 }), 2);
    place(state, opp, battleCard({ id: 966042 }), 3);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP02-069"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({
      "2": [966042],
      "3": [966041],
    });
  });
});

describe("EBP02 destroy cards (C3, T7, C2)", () => {
  it("EBP02-018 4.4.5.3: with 2 or more rage, destroys 1 opponent battle card at or before your monster's zone number", () => {
    const { state, me, opp } = setup(4);
    me.rage = 2;
    place(state, opp, battleCard({ id: 966051 }), 4);
    place(state, opp, battleCard({ id: 966052 }), 5);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP02-018"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "5": [966052] });
  });

  it("EBP02-026 4.4.5.2: on enter with a strategy card in play, destroys rank 5 or lower in a chosen zone and its adjacent zones", () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(3, ["Blue"]), 2);
    me.invadingMonsterZone = [
      addCard(state, monsterCard(3, { traits: ["Biollante"] }), me.id),
    ];
    inStrategy(state, me, strategyCard());
    place(state, opp, battleCard({ id: 966061, rank: 5 }), 6);
    place(state, opp, battleCard({ id: 966062, rank: 6 }), 7);
    let after = playMonster(state, me, inHand(state, me, real("EBP02-026")));
    after = settle(choose(after, (id) => id === `${opp.id}:6`));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "7": [966062] });
  });

  it("EBP02-048 5.7.3, 12.3: on enter mill 3; when invading, destroy 3 rank 4 or lower battle cards", () => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("EBP02-048"), 1);
    for (const zone of [2, 3, 4] as ZoneNumber[])
      place(state, opp, battleCard({ rank: 4 }), zone);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
    const entered = setup();
    monster(
      entered.state,
      entered.me,
      monsterCard(2, { traits: ["King Ghidorah"] }),
      2,
    );
    const milled = settle(
      playMonster(
        entered.state,
        entered.me,
        inHand(entered.state, entered.me, real("EBP02-048")),
      ),
    );
    expect(self(milled, entered.me).discard).toHaveLength(3);
  });

  it("EBP02-073 4.4.5.4: on your turn, whenever you play a battle card, destroys the opponent's rank 6 or lower battle cards in its column", () => {
    const { state, me, opp } = setup();
    inStrategy(state, me, real("EBP02-073"));
    // My zone 2 is in the same column as the opponent's zones 4 and 7.
    place(state, opp, battleCard({ id: 966071, rank: 6 }), 4);
    place(state, opp, battleCard({ id: 966072, rank: 7 }), 7);
    place(state, opp, battleCard({ id: 966073, rank: 1 }), 1);
    const after = settle(play(state, me, inHand(state, me, battleCard()), 2));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({
      "1": [966073],
      "7": [966072],
    });
  });

  it("EBP02-079 5.13.3: destroys by how many zones your monster advanced through invasion this turn", () => {
    const run = (icon: number | null) => {
      const { state, me, opp } = setup(4);
      for (const [zone, r] of [
        [1, 2],
        [2, 4],
        [3, 6],
      ] as const)
        place(state, opp, battleCard({ id: 966080 + r, rank: r }), zone);
      const start =
        icon === null
          ? state
          : settle(invade(state, me, invader(state, me, icon)));
      const player = self(start, me);
      return zoneCardIds(
        opponentOf(
          settle(
            activate(start, player, inHand(start, player, real("EBP02-079"))),
          ),
          me,
        ),
      );
    };
    expect(run(null)).toEqual({ "2": [966084], "3": [966086] });
    expect(run(1)).toEqual({ "3": [966086] });
    expect(run(2)).toEqual({});
  });
});

describe("EBP02 choose-one cards (E7)", () => {
  it("EBP02-038 10.5.2.2.1: with fewer than 10 monster cards only the first option runs; with 10, you may destroy a battle card in zone 8", () => {
    const run = (monsters: number) => {
      const { state, me, opp } = setup();
      opp.monsterPosition = 5;
      place(state, opp, battleCard({ id: 966091, rank: 9 }), 8);
      place(state, opp, battleCard({ id: 966092, rank: 5 }), 2);
      for (let i = 0; i < monsters; i++) inDiscard(state, me, monsterCard(1));
      let after = activate(state, me, inHand(state, me, real("EBP02-038")));
      if (after.pendingChoice?.kind === "option")
        after = choose(after, (id) => id === "1");
      return zoneCardIds(opponentOf(settle(after), me));
    };
    expect(run(9)).toEqual({ "8": [966091] });
    expect(run(10)).toEqual({ "2": [966092] });
  });

  it("EBP02-049 3.2: on enter with 3 cards under it, choose one: e.g. the opponent discards down to 3", () => {
    const { state, me, opp } = setup();
    monster(state, me, kg(), 2);
    me.invadingMonsterZone = [
      addCard(state, monsterCard(3, { traits: ["King Ghidorah"] }), me.id),
    ];
    under(state, me, [kg(), kg(), kg()]);
    while (opp.hand.length < 6) inHand(state, opp, battleCard());
    let after = playMonster(state, me, inHand(state, me, real("EBP02-049")));
    expect(after.pendingChoice?.options.map((o) => o.id)).toEqual([
      "0",
      "1",
      "2",
    ]);
    after = settle(choose(after, (id) => id === "1"));
    expect(opponentOf(after, me).hand).toHaveLength(3);
  });

  it("EBP02-050 3.2: on enter with 5 cards under it, choose one: e.g. +3 rage", () => {
    const { state, me } = setup();
    me.invadingMonsterZone = [
      addCard(state, monsterCard(4, { traits: ["King Ghidorah"] }), me.id),
    ];
    under(state, me, [kg(), kg(), kg(), kg(), kg()]);
    let after = playMonster(state, me, inHand(state, me, real("EBP02-050")));
    after = settle(choose(after, (id) => id === "2"));
    // +1 for the monster play (8.5.1.1), +3 from the option.
    expect(self(after, me).rage).toBe(4);
  });

  it("EBP02-071 12.4: options 2 and 3 need [awakening-6] and [awakening-8]", () => {
    const options = (position: ZoneNumber) => {
      const { state, me, opp } = setup(position);
      place(state, opp, battleCard({ rank: 2 }), 2);
      return (
        activate(
          state,
          me,
          inHand(state, me, real("EBP02-071")),
        ).pendingChoice?.options.map((o) => o.id) ?? []
      );
    };
    expect(options(5)).toEqual([]);
    expect(options(6)).toEqual(["0", "1"]);
    expect(options(8)).toEqual(["0", "1", "2"]);
  });
});

describe("EBP02 Biollante cards", () => {
  it("EBP02-027 7.4.3: on the opponent's turn in zone 6+, with their strategy card in play, 40,000 doesn't counter it (E13)", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP02-027"), 6);
    inStrategy(state, opp, strategyCard());
    place(state, opp, battleCard({ counterOrThreat: 40000 }), 1);
    const after = settleUntil(pass(state), "7.5.1");
    expect(newLogTypes(after, state)).toContain("counterPrevented");
  });

  it("EBP02-028 5.11.1: on enter, plays rank 4 or lower Evolution battle cards from the discard pile, one per adjacent zone", () => {
    const run = (position: ZoneNumber) => {
      const { state, me } = setup(position);
      monster(state, me, monsterCard(4, { traits: ["Biollante"] }), position);
      for (let i = 0; i < 3; i++) inDiscard(state, me, real("EBP01-044"));
      const after = settle(
        playMonster(state, me, inHand(state, me, real("EBP02-028"))),
      );
      return Object.keys(zoneCardIds(self(after, me))).sort();
    };
    // Zone 3 is adjacent to 2, 4 and 8; zone 1 only to 2.
    expect(run(3)).toEqual(["2", "4", "8"]);
    expect(run(1)).toEqual(["2"]);
  });

  it("EBP02-029 10.8.2: at the beginning of the opponent's counter phase, their battle cards in its column have their counter power doubled for the turn (E19, Q26)", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP02-029"), 5);
    const inColumn = place(
      state,
      opp,
      battleCard({ counterOrThreat: 4000 }),
      1,
    );
    const other = place(state, opp, battleCard({ counterOrThreat: 4000 }), 2);
    const after = settleUntil(pass(state), "7.4.2");
    expect(getCounterPower(after, inColumn)).toBe(8000);
    expect(getCounterPower(after, other)).toBe(4000);
    // It ends with the turn (7.5.6).
    expect(getCounterPower(runTo(after, "7.5.7"), inColumn)).toBe(4000);
  });

  it("EBP02-039 8.2.1: on your turn your Biollante battle cards count 3 ranks lower", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 4;
    const card = inHand(state, me, real("EBP02-035")); // rank 7
    expect(canPlay(state, me, card)).toBe(false);
    inStrategy(state, me, real("EBP02-039"));
    expect(canPlay(state, me, card)).toBe(true);
  });
});

describe("EBP02 hand and deck cards (E3, E11, CU)", () => {
  it("EBP02-037 5.4: draw 2, then discard 2", () => {
    const { state, me } = setup();
    const card = inHand(state, me, real("EBP02-037"));
    const hand = me.hand.length - 1;
    expect(self(settle(play(state, me, card, 2)), me).hand).toHaveLength(hand);
  });

  it("EBP02-040 5.7.1: with 5 Weapon battle cards with MB in their name, discard your hand and draw 5", () => {
    const { state, me } = setup(7);
    for (const zone of [1, 2, 3, 4, 5] as ZoneNumber[])
      place(state, me, real("EBP01-046"), zone);
    inHand(state, me, battleCard());
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP02-040"))),
    );
    expect(self(after, me).hand).toHaveLength(5);
  });

  it("EBP02-078 5.10: in the opponent's monster's column, reveal 2; rank 5 or lower battle cards go to your hand, the rest to the discard pile", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 7; // the opponent's zone 7 is in my zone 2's column
    stackDeck(state, me, [
      battleCard({ id: 966101, rank: 5 }),
      battleCard({ id: 966102, rank: 6 }),
    ]);
    const after = settle(
      play(state, me, inHand(state, me, real("EBP02-078")), 2),
    );
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(966101);
    expect(self(after, me).discard.map((c) => c.cardId)).toContain(966102);
  });

  it("EBP02-080 5.10: reveal 2; if their traits differ they go to your hand, otherwise to the discard pile (CU)", () => {
    const run = (a: string[], b: string[]) => {
      const { state, me } = setup();
      stackDeck(state, me, [
        battleCard({ traits: a }),
        battleCard({ traits: b }),
      ]);
      const before = me.hand.length;
      const after = settle(
        activate(state, me, inHand(state, me, real("EBP02-080"))),
      );
      return self(after, me).hand.length - before;
    };
    expect(run(["Mech"], ["Mechagodzilla", "Mech"])).toBe(2);
    expect(run(["Mech"], ["Mech"])).toBe(0);
  });
});

describe("EBP02 King Ghidorah cards", () => {
  it("EBP02-046 3.2: on enter, every King Ghidorah (1965) in your discard pile goes under it; +3,000 threat for each", () => {
    const { state, me } = setup();
    monster(state, me, kg(), 2);
    me.invadingMonsterZone = [
      addCard(state, monsterCard(3, { traits: ["King Ghidorah"] }), me.id),
    ];
    inDiscard(state, me, real("EBP02-046"));
    inDiscard(state, me, real("EBP02-046"));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP02-046"))),
    );
    expect(self(after, me).invadingMonsterZone).toHaveLength(4);
    // 23,000 printed, +5,000 for the 1 rage of the monster play, +6,000.
    expect(getThreat(after, me.id)).toBe(23000 + 5000 + 6000);
  });

  it("EBP02-068 8.2.1: 2 ranks lower per non-rank 23 King Ghidorah card in your discard pile", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 3;
    const card = inHand(state, me, real("EBP02-068"));
    for (let i = 0; i < 9; i++) inDiscard(state, me, kg());
    expect(canPlay(state, me, card)).toBe(false);
    inDiscard(state, me, kg());
    expect(canPlay(state, me, card)).toBe(true);
  });

  it("EBP02-068 8.6: in the opponent's monster's column, they can't invade; +3,000", () => {
    const { state, me, opp } = opponentsTurn();
    opp.monsterPosition = 1;
    const card = place(state, me, real("EBP02-068"), 5);
    expect(getCounterPower(state, card)).toBe(10000);
    expect(
      getLegalActions(state, opp.id).some((a) => a.type === "invade"),
    ).toBe(false);
  });
});

describe("EBP02 play restrictions (M1 cannotPlay)", () => {
  it("EBP02-055 8.2: in zone 4+ with 3 Crystals, the opponent can't play battle cards in its column", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP02-055"), 4);
    for (const zone of [1, 2, 3] as ZoneNumber[])
      place(state, me, battleCard({ name: "Crystals" }), zone);
    opp.monsterPosition = 8;
    const card = inHand(state, opp, battleCard());
    const zones = getLegalActions(state, opp.id)
      .filter(
        (a) => a.type === "playBattle" && a.cardInstanceId === card.instanceId,
      )
      .map((a) => (a.type === "playBattle" ? a.zone : 0));
    // My zone 4 is in the same column as the opponent's zone 2 (4.4.5.4).
    expect(zones).not.toContain(2);
    expect(zones).toContain(1);
    expect(zones).toContain(7);
  });

  it("EBP02-070 8.3: on the opponent's turn they can't activate strategy cards (Q32)", () => {
    const { state, me, opp } = opponentsTurn();
    inStrategy(state, me, real("EBP02-070"));
    const card = inHand(state, opp, strategyCard());
    expect(canPlay(state, opp, card)).toBe(false);
  });

  it("EBP02-070 5.7.2: at the beginning of the opponent's main phase they may discard down to 5; if they discard any, it is destroyed", () => {
    const run = (answer: "yes" | "no") => {
      let state = runTo(newGame(), "7.3.1");
      const opp = turnPlayer(state);
      const me = nonTurnPlayer(state);
      inStrategy(state, me, real("EBP02-070"));
      while (opp.hand.length < 7) inHand(state, opp, battleCard());
      state = settle(state, 0);
      while (state.pendingChoice?.kind !== "confirm" && state.step !== "7.3.2")
        state = settle(state, 1);
      if (state.pendingChoice?.kind === "confirm") {
        expect(state.pendingChoice.player).toBe(opp.id);
        state = choose(state, (id) => id === answer);
      }
      return self(settle(state), me).strategyZones[0];
    };
    expect(run("yes")).toEqual([]);
    expect(run("no")).toHaveLength(1);
  });
});

describe("EBP02-022 Godzilla (1994) (T7)", () => {
  it("EBP02-022 8.6.1.1: when invading, you may play the blue battle card you discarded for this invade action", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP02-022"), 1);
    const paid = inHand(
      state,
      me,
      battleCard({ id: 966111, colors: ["Blue"], invadeZones: 1 }),
    );
    const after = settle(invade(state, me, paid));
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      966111,
    );
  });

  it("EBP02-022 10.5.2.3.3: a red card discarded for the invasion isn't played", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP02-022"), 1);
    const paid = inHand(
      state,
      me,
      battleCard({ id: 966112, colors: ["Red"], invadeZones: 1 }),
    );
    const after = settle(invade(state, me, paid));
    expect(Object.values(zoneCardIds(self(after, me))).flat()).not.toContain(
      966112,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The M12b-1 format pieces on their own, with fixture abilities.

describe("M12b-1 format pieces", () => {
  const numbers: string[] = [];
  afterEach(() => {
    for (const n of numbers.splice(0)) setTestAbilities(n, null);
  });
  function withData(card: Card, abilities: CardAbilities["abilities"]) {
    numbers.push(card.deckCardNumber);
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities,
    });
    return card;
  }

  it("T7 5.11.3: a card-played trigger can ask where the card came from", () => {
    const { state, me } = setup();
    place(
      state,
      me,
      withData(battleCard(), [
        {
          kind: "triggered",
          id: "from-hand",
          trigger: {
            on: "cardPlayed",
            by: "you",
            what: { owner: "you", area: "zones", type: "Battle" },
            from: "discard",
          },
          effects: [{ effect: "draw", player: "you", count: 1 }],
        },
      ]),
      8,
    );
    const after = settle(play(state, me, inHand(state, me, battleCard()), 2));
    expect(newLogTypes(after, state)).not.toContain("enterStandby");
  });

  it("Q32 5.9: an effect can't put a strategy card into play for a player who can't play strategy cards", () => {
    const { state, me, opp } = opponentsTurn();
    inStrategy(state, me, real("EBP02-070"));
    opp.monsterPosition = 8;
    // The opponent's battle card: "[enter] activate a strategy card from your discard pile".
    const activator = withData(battleCard(), [
      {
        kind: "triggered",
        id: "activate",
        trigger: { on: "enter" },
        effects: [
          {
            effect: "activate",
            from: "discard",
            filter: { owner: "you", area: "discard", type: "Strategy" },
            count: { upTo: 1 },
          },
        ],
      },
    ]);
    const waiting = inDiscard(state, opp, strategyCard());
    const after = settle(play(state, opp, inHand(state, opp, activator), 2));
    expect(opponentOf(after, opp).id).toBe(me.id);
    expect(self(after, opp).strategyZones.flat()).toEqual([]);
    expect(self(after, opp).discard.map((c) => c.cardId)).toContain(
      waiting.cardId,
    );
  });
});

describe("Paul's rulings Q36 to Q39 (Oct 24, 2026)", () => {
  it("Q36 8.2.1: rank reductions stack: Lake Ashi Monster's -3 plus EBP01-058's own -2", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 2;
    const card = inHand(state, me, real("EBP01-058")); // rank 7 Biollante
    inDiscard(state, me, real("EBP01-048")); // a Biollante card with Evolution: its own -2
    expect(canPlay(state, me, card)).toBe(false); // 5
    inStrategy(state, me, real("EBP02-039")); // -3 more
    expect(canPlay(state, me, card)).toBe(true); // 2
  });

  it("Q37 1.3.1: an effect play ignores the 8.2.1 rank limit (EBP01-034 plays a rank 4 card with the opponent's monster in zone 1)", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 1;
    monster(state, me, godzilla(2, ["Blue"]), 3);
    inDiscard(state, me, real("EBP01-050")); // rank 4, Evolution
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-034"))),
    );
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      real("EBP01-050").id,
    );
  });

  it('Q38 3.4: "+1 rage for each" is one increase per card: EBP01-015 milling 3 monster cards fires Ginza Annihilated 3 times', () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(4), 3);
    inStrategy(state, me, real("ESD01-013"));
    for (const zone of [1, 2, 3, 4, 5] as ZoneNumber[])
      place(state, opp, battleCard({ rank: 6 }), zone);
    stackDeck(state, me, [
      monsterCard(1),
      monsterCard(2),
      monsterCard(3),
      battleCard(),
      battleCard(),
    ]);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-015"))),
    );
    const increases = after.log
      .slice(state.log.length)
      .filter(
        (e) =>
          e.type === "rageChanged" &&
          e.payload["abilityId"] === "EBP01-015#enter-reveal",
      );
    expect(increases.map((e) => [e.payload["from"], e.payload["to"]])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    // 1 destroy for the monster play's rage (8.5.1.1) and 3 for EBP01-015's.
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toHaveLength(1);
  });

  it("Q39 9.1.4.1: a token in your zones is a battle card for counts, conditions and counter power", () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 5;
    const token = () =>
      battleCard({
        type: "Token",
        traits: ["Token"],
        rank: 1,
        counterOrThreat: 3000,
      });
    place(state, me, token(), 1);
    place(state, me, token(), 2);
    place(state, me, token(), 3);
    // EBP01-027 Hedorah (rank 8) counts 1 lower per battle card in your zones: 8 - 3 = 5.
    expect(canPlay(state, me, inHand(state, me, real("EBP01-027")))).toBe(true);
    // EBP02-031: 2 or more other rank 5 or lower battle cards.
    expect(getCounterPower(state, place(state, me, real("EBP02-031"), 4))).toBe(
      5000,
    );
    // 7.4.2 counts tokens' counter power.
    expect(counterPowerOf(state, me)).toBe(3 * 3000 + 5000);
  });
});
