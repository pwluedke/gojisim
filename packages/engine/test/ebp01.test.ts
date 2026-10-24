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
  getCounterPower,
  getLegalActions,
  getThreat,
  type ZoneNumber,
} from "../src";
import { setTestAbilities } from "../src/testing";
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
  nonTurnPlayer,
  runTo,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";

// M12a-1: EBP01 cards that need only today's format or the pieces C5, C6, C7, T1, T3 to T6 and
// T8 (docs/abilities/m12-plan.md). One test (or more) per card, named with its rule numbers.

import {
  play,
  playMonster,
  activate,
  invade,
  gainRage,
  choose,
  settle,
  invader,
  godzilla,
  setup,
  settleUntil,
  newLogTypes,
  opponentsTurn,
  opponentOf,
  self,
} from "./fixtures/play";

describe("EBP01 cards with no ability text", () => {
  it.each(["EBP01-016", "EBP01-053"])(
    "%s 10.1: implemented with no abilities",
    (number) => {
      expect(getCardAbilities(number)).toMatchObject({
        status: "implemented",
        abilities: [],
      });
    },
  );
});

describe("EBP01 Burst and Evolution keywords", () => {
  it.each([
    ["EBP01-004", 3],
    ["EBP01-005", 3],
    ["EBP01-007", 3],
    ["EBP01-009", 2],
    ["EBP01-013", 2],
  ] as const)("%s 12.5.1: Burst rank %i, as printed", (number, rank) => {
    expect(getCardAbilities(number).abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "burst", rank },
    });
  });

  it.each([
    ["EBP01-044", 5, "Mothra"],
    ["EBP01-048", 7, "Biollante"],
    ["EBP01-049", 6, "Destoroyah"],
    ["EBP01-050", 7, "Mothra"],
    ["EBP01-054", 8, "Destoroyah"],
  ] as const)(
    "%s 12.6.1: Evolution rank %i, trait %s, as printed",
    (number, rank, trait) => {
      expect(getCardAbilities(number).abilities).toContainEqual({
        kind: "keyword",
        keyword: { name: "evolution", rank, trait },
      });
    },
  );

  it("EBP01-005 12.5.2: a Burst rank III play on a rank III Godzilla is legal", () => {
    const { state, me } = setup();
    monster(state, me, godzilla(3), 1);
    const card = inHand(state, me, real("EBP01-005"));
    expect(getLegalActions(state, me.id)).toContainEqual({
      type: "playMonster",
      player: me.id,
      cardInstanceId: card.instanceId,
    });
  });
});

describe("EBP01-004 Godzilla (1954)", () => {
  it("EBP01-004 5.13.1: when it reaches zone 8, every battle card in each player's zones is destroyed", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-004"), 7);
    place(state, me, battleCard(), 2);
    place(state, opp, battleCard(), 3);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });
});

describe("EBP01-005 Godzilla (1955)", () => {
  it("EBP01-005 5.7.2: on enter, the opponent discards down to 4", () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(4), 1);
    while (opp.hand.length < 6) inHand(state, opp, battleCard());
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-005"))),
    );
    expect(opponentOf(after, me).hand).toHaveLength(4);
  });
});

describe("EBP01-006 Godzilla (1974)", () => {
  it("EBP01-006 4.4.5.4: at the beginning of the counter phase on the opponent's turn, destroys their rank 5 or lower battle cards in its column", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP01-006"), 5);
    // My zone 5 is in the same column as the opponent's zone 1.
    place(state, opp, battleCard({ id: 963001, rank: 5 }), 1);
    place(state, opp, battleCard({ id: 963002, rank: 3 }), 2);
    const after = runTo(state, "7.4.2");
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "2": [963002] });
  });
});

describe("EBP01-007 Godzilla (1975)", () => {
  it("EBP01-007 11.3: when its invasion crushes one of your battle cards, the opponent loses 2 rage", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-007"), 1);
    place(state, me, battleCard(), 2);
    opp.rage = 3;
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EBP01-007 12.3: a crush by the end phase advance (7.5.2) is not an invasion", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-007"), 1);
    place(state, me, battleCard(), 2);
    opp.rage = 3;
    const after = runTo(state, "7.5.3");
    expect(self(after, me).monsterPosition).toBe(2);
    expect(opponentOf(after, me).rage).toBe(3);
  });
});

describe("EBP01-009 Godzilla (2023)", () => {
  it("EBP01-009 12.3: when invading with 2 or more rage, destroys 1 of the opponent's rank 6 or lower battle cards", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-009"), 1);
    me.rage = 2;
    place(state, opp, battleCard({ id: 963011, rank: 6 }), 2);
    place(state, opp, battleCard({ id: 963012, rank: 7 }), 3);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [963012] });
  });

  it("EBP01-009 10.5.2.3.3: with 1 rage nothing happens", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-009"), 1);
    me.rage = 1;
    place(state, opp, battleCard({ rank: 6 }), 2);
    const after = settle(invade(state, me, invader(state, me)));
    expect(logTypes(after)).toContain("conditionNotMet");
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toEqual(["2"]);
  });
});

describe("EBP01-010 Godzilla (2023)", () => {
  it("EBP01-010 3.4: whenever its rage goes up, destroys every opponent battle card in its column", () => {
    const { state, me, opp } = setup(5);
    monster(state, me, real("EBP01-010"), 5);
    place(state, opp, battleCard({ id: 963021, rank: 9 }), 1);
    place(state, opp, battleCard({ id: 963022 }), 2);
    const after = settle(
      gainRage(state, me, inHand(state, me, monsterCard(2))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "2": [963022] });
  });

  it("EBP01-010 7.4.1: at the beginning of the counter phase on the opponent's turn, with 3 or more rage, the same destroy", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP01-010"), 5);
    me.rage = 3;
    place(state, opp, battleCard({ id: 963023 }), 1);
    const after = runTo(state, "7.4.2");
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
    me.rage = 2;
    place(state, opp, battleCard({ id: 963024 }), 1);
    expect(zoneCardIds(opponentOf(runTo(state, "7.4.2"), me))).toEqual({
      "1": [963024],
    });
  });
});

describe("EBP01-013 Godzilla (Fest Godzilla)", () => {
  it("EBP01-013 12.2: on enter with 4 or more of your battle cards in zones, the opponent loses 1 rage", () => {
    const run = (count: number) => {
      const { state, me, opp } = setup();
      monster(state, me, godzilla(3), 1);
      opp.rage = 2;
      for (let i = 0; i < count; i++)
        place(state, me, battleCard(), (i + 2) as ZoneNumber);
      return opponentOf(
        settle(playMonster(state, me, inHand(state, me, real("EBP01-013")))),
        me,
      ).rage;
    };
    expect(run(4)).toBe(1);
    expect(run(3)).toBe(2);
  });
});

describe("EBP01 counter power bonuses", () => {
  it("EBP01-017 10.8.1: +3,000 in zone 8", () => {
    const { state, me } = setup();
    expect(getCounterPower(state, place(state, me, real("EBP01-017"), 8))).toBe(
      4000,
    );
    expect(getCounterPower(state, place(state, me, real("EBP01-017"), 7))).toBe(
      1000,
    );
  });

  it("EBP01-018 12.4: +3,000 while its monster is in zone 4 or beyond", () => {
    const { state, me } = setup(3);
    const card = place(state, me, real("EBP01-018"), 2);
    expect(getCounterPower(state, card)).toBe(1000);
    me.monsterPosition = 4;
    expect(getCounterPower(state, card)).toBe(4000);
  });

  it("EBP01-023 10.8.1: +3,000 while its monster has 2 or more rage", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP01-023"), 2);
    me.rage = 1;
    expect(getCounterPower(state, card)).toBe(4000);
    me.rage = 2;
    expect(getCounterPower(state, card)).toBe(7000);
  });

  it.each(["EBP01-025", "EBP01-068"])(
    "%s 4.4.5.2: +3,000 in a zone adjacent to your monster",
    (number) => {
      const { state, me } = setup(3);
      const printed = real(number).counterOrThreat ?? 0;
      expect(getCounterPower(state, place(state, me, real(number), 8))).toBe(
        printed + 3000,
      );
      expect(getCounterPower(state, place(state, me, real(number), 6))).toBe(
        printed,
      );
    },
  );

  it.each([
    ["EBP01-046", 6],
    ["EBP01-067", 4],
  ] as const)(
    "%s 12.4: +3,000 while its monster is in zone %i or beyond",
    (number, zone) => {
      const { state, me } = setup((zone - 1) as ZoneNumber);
      const card = place(state, me, real(number), 1);
      const printed = real(number).counterOrThreat ?? 0;
      expect(getCounterPower(state, card)).toBe(printed);
      me.monsterPosition = zone;
      expect(getCounterPower(state, card)).toBe(printed + 3000);
    },
  );

  it("EBP01-046 6.1.1.4: any number of copies in a deck (Q13)", () => {
    expect(getCardAbilities("EBP01-046").deckRules).toEqual([
      { rule: "anyNumber" },
    ]);
  });

  it("EBP01-051 10.8.1: +3,000 with 5 or more monster cards in your discard pile", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP01-051"), 2);
    for (let i = 0; i < 4; i++) inDiscard(state, me, monsterCard(1));
    expect(getCounterPower(state, card)).toBe(3000);
    inDiscard(state, me, monsterCard(1));
    expect(getCounterPower(state, card)).toBe(6000);
  });

  it("EBP01-056 4.4.5.4: in the opponent's monster's column, +3,000 per point of the opponent's rage (C6)", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 1;
    opp.rage = 2;
    // The opponent's zone 1 is in the same column as my zones 5 and 6.
    expect(getCounterPower(state, place(state, me, real("EBP01-056"), 5))).toBe(
      11000,
    );
    expect(getCounterPower(state, place(state, me, real("EBP01-056"), 4))).toBe(
      5000,
    );
  });

  it("EBP01-062 7.4.2: +10,000 total counter power on your turn with a Destoroyah battle card in your zones", () => {
    const { state, me } = setup();
    me.strategyZones[0].push({
      card: addCard(state, real("EBP01-062"), me.id),
      placedOnTurn: 1,
    });
    expect(counterPowerOf(state, me)).toBe(0);
    place(state, me, real("EBP01-049"), 2);
    expect(counterPowerOf(state, me)).toBe(3000 + 10000);
    // Not on the opponent's turn (Q9).
    state.turnPlayer = nonTurnPlayer(state).id;
    expect(counterPowerOf(state, me)).toBe(3000);
  });

  it("EBP01-071 4.4.5.4: +5,000 in the opponent's monster's column", () => {
    const { state, me, opp } = setup(2);
    opp.monsterPosition = 1;
    expect(getCounterPower(state, place(state, me, real("EBP01-071"), 6))).toBe(
      10000,
    );
    expect(getCounterPower(state, place(state, me, real("EBP01-071"), 3))).toBe(
      5000,
    );
  });

  it("EBP01-074 10.8.1: +20,000 while you have Gravity Beam in a strategy zone", () => {
    const { state, me } = setup();
    const card = place(state, me, real("EBP01-074"), 2);
    expect(getCounterPower(state, card)).toBe(8000);
    me.strategyZones[1].push({
      card: addCard(state, real("EBP01-079"), me.id),
      placedOnTurn: 1,
    });
    expect(getCounterPower(state, card)).toBe(28000);
  });
});

describe("EBP01-019 Kamacuras (1967)", () => {
  it("EBP01-019 12.4, 5.8: played from the hand with its monster in zone 6 or beyond, searches up to 2 Kamacuras and plays them; theirs don't search (C7)", () => {
    const { state, me } = setup(6);
    onDeck(state, me, real("EBP01-019"));
    onDeck(state, me, real("EBP01-019"));
    const after = settle(
      play(state, me, inHand(state, me, real("EBP01-019")), 8), // zones 1 and 2 stay empty for the two it plays
    );
    const kamacuras = real("EBP01-019").id;
    const tops = Object.values(zoneCardIds(self(after, me))).flat();
    expect(tops.filter((id) => id === kamacuras)).toHaveLength(3);
    // The two played by the effect fail "played from your hand".
    expect(logTypes(after).filter((t) => t === "conditionNotMet")).toHaveLength(
      2,
    );
  });

  it("EBP01-019 12.4: with its monster before zone 6 it doesn't trigger", () => {
    const { state, me } = setup(5);
    onDeck(state, me, real("EBP01-019"));
    const after = settle(
      play(state, me, inHand(state, me, real("EBP01-019")), 2),
    );
    expect(newLogTypes(after, state)).not.toContain("search");
  });
});

describe("EBP01-020 Anguirus (1968)", () => {
  function run(rage: number) {
    const { state, me } = setup();
    me.rage = rage;
    place(state, me, real("EBP01-020"), 8);
    onDeck(state, me, real("EBP01-005"));
    return { me, after: settle(invade(state, me, invader(state, me))) };
  }

  it("EBP01-020 5.14.1: in zone 8, when your monster invades, you may pay 1 rage to search a monster card with Burst", () => {
    const { me, after } = run(1);
    expect(self(after, me).rage).toBe(0);
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(
      real("EBP01-005").id,
    );
  });

  it("EBP01-020 10.5.4.1: with no rage the cost can't be paid", () => {
    const { after } = run(0);
    expect(logTypes(after)).toContain("costNotPaid");
    expect(logTypes(after)).not.toContain("search");
  });
});

describe("EBP01-024 Minilla (2004)", () => {
  it("EBP01-024 12.2: on enter, the opponent loses 1 rage", () => {
    const { state, me, opp } = setup();
    opp.rage = 2;
    const after = settle(
      play(state, me, inHand(state, me, real("EBP01-024")), 2),
    );
    expect(opponentOf(after, me).rage).toBe(1);
  });
});

describe("EBP01-029 Unthinkable Destruction", () => {
  it("EBP01-029 4.4.5.2: destroys the opponent's rank 5 or lower battle cards in the chosen zone and the zones adjacent to it", () => {
    const { state, me, opp } = setup();
    place(state, opp, battleCard({ id: 963031, rank: 5 }), 6);
    place(state, opp, battleCard({ id: 963032, rank: 6 }), 7);
    place(state, opp, battleCard({ id: 963033, rank: 2 }), 5);
    place(state, opp, battleCard({ id: 963034, rank: 1 }), 2);
    const paused = activate(state, me, inHand(state, me, real("EBP01-029")));
    expect(paused.pendingChoice).toMatchObject({ kind: "zone" });
    const after = settle(choose(paused, (id) => id === `${opp.id}:6`));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({
      "2": [963034],
      "7": [963032],
    });
  });
});

describe("EBP01-031 Space Beam", () => {
  it("EBP01-031 5.7.2: with 2 or more rage, the opponent discards down to 2", () => {
    const run = (rage: number) => {
      const { state, me, opp } = setup();
      me.rage = rage;
      while (opp.hand.length < 5) inHand(state, opp, battleCard());
      return opponentOf(
        settle(activate(state, me, inHand(state, me, real("EBP01-031")))),
        me,
      ).hand.length;
    };
    expect(run(2)).toBe(2);
    expect(run(1)).toBe(5);
  });
});

describe("EBP01-032 Heat Ray Charge", () => {
  it("EBP01-032 5.4: draws 2 cards", () => {
    const { state, me } = setup();
    const card = inHand(state, me, real("EBP01-032"));
    const before = me.hand.length - 1;
    const after = settle(activate(state, me, card));
    expect(self(after, me).hand).toHaveLength(before + 2);
  });
});

describe("EBP01-034 Godzilla (1989)", () => {
  it("EBP01-034 5.11.1: on enter, plays a rank 4 or lower battle card with Evolution from the discard pile in a zone adjacent to it", () => {
    const { state, me } = setup(3);
    monster(state, me, godzilla(2, ["Blue"]), 3);
    inDiscard(state, me, real("EBP01-044"));
    inDiscard(state, me, real("EBP01-053")); // no Evolution
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-034"))),
    );
    const zones = zoneCardIds(self(after, me));
    expect(Object.values(zones).flat()).toEqual([real("EBP01-044").id]);
    // Zones adjacent to zone 3: 2, 4 and 8 (4.4.5.2).
    expect(["2", "4", "8"]).toContain(Object.keys(zones)[0]);
  });
});

describe("EBP01-037 Godzilla (1995)", () => {
  it("EBP01-037 5.13.1: whenever it advances, you may discard a strategy card for 1 rage", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP01-037"), 3);
    inHand(state, me, strategyCard());
    const after = settle(invade(state, me, invader(state, me)));
    expect(self(after, me).rage).toBe(1);
    expect(self(after, me).hand).toHaveLength(
      state.players.find((p) => p.id === me.id)!.hand.length - 2,
    );
  });

  it("EBP01-037 10.5.4.1: with no strategy card in hand, no rage", () => {
    const { state, me } = setup(3);
    monster(state, me, real("EBP01-037"), 3);
    const after = settle(invade(state, me, invader(state, me)));
    expect(self(after, me).rage).toBe(0);
    expect(logTypes(after)).toContain("costNotPaid");
  });
});

describe("EBP01-039 Godzilla (1999)", () => {
  it("EBP01-039 12.3: when invading, discard a monster card to destroy the opponent's rank 5 or lower battle cards in zones 1-5 (Q2)", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-039"), 1);
    inHand(state, me, monsterCard(3));
    place(state, opp, battleCard({ id: 963041, rank: 5 }), 2);
    place(state, opp, battleCard({ id: 963042, rank: 6 }), 3);
    place(state, opp, battleCard({ id: 963043, rank: 1 }), 7);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({
      "3": [963042],
      "7": [963043],
    });
  });
});

describe("EBP01-040 Godzilla (1999)", () => {
  it("EBP01-040 12.2: on enter, destroys 1 of the opponent's rank 7 or lower battle cards", () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(4, ["Blue"]), 1);
    place(state, opp, battleCard({ id: 963051, rank: 7 }), 2);
    place(state, opp, battleCard({ id: 963052, rank: 8 }), 3);
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-040"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [963052] });
  });

  it("EBP01-040 12.3: when invading with 5 or more monster cards in your discard pile, +1 rage", () => {
    const { state, me } = setup();
    monster(state, me, real("EBP01-040"), 1);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    expect(self(settle(invade(state, me, invader(state, me))), me).rage).toBe(
      1,
    );
  });
});

describe("EBP01-041 Godzilla (2000)", () => {
  it("EBP01-041 12.3: when invading, destroys 1 of the opponent's rank 4 or lower battle cards", () => {
    const { state, me, opp } = setup();
    monster(state, me, real("EBP01-041"), 1);
    place(state, opp, battleCard({ id: 963061, rank: 4 }), 2);
    place(state, opp, battleCard({ id: 963062, rank: 5 }), 3);
    const after = settle(invade(state, me, invader(state, me)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [963062] });
  });
});

describe("EBP01-042 Godzilla (2000)", () => {
  it("EBP01-042 12.2: on enter with 5 monster cards in the discard pile, you may discard a card to reduce the opponent's rage by 1", () => {
    const { state, me, opp } = setup();
    monster(state, me, godzilla(3, ["Blue"]), 1);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    opp.rage = 2;
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP01-042"))),
    );
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EBP01-042 10.8.1: +10,000 threat with 5 or more monster cards in the discard pile", () => {
    const { state, me } = setup();
    monster(state, me, real("EBP01-042"), 3);
    for (let i = 0; i < 4; i++) inDiscard(state, me, monsterCard(1));
    expect(getThreat(state, me.id)).toBe(18000);
    inDiscard(state, me, monsterCard(1));
    expect(getThreat(state, me.id)).toBe(28000);
  });
});

describe("EBP01-043 Godzilla (2000)", () => {
  function run(position: ZoneNumber) {
    const { state, me, opp } = setup(position);
    monster(state, me, real("EBP01-043"), position);
    for (let i = 0; i < 5; i++) inDiscard(state, me, monsterCard(1));
    opp.monsterPosition = 1;
    place(state, me, battleCard({ counterOrThreat: 99000 }), 2);
    place(state, opp, battleCard({ id: 963071, rank: 6 }), 2);
    place(state, opp, battleCard({ id: 963072, rank: 7 }), 3);
    return {
      me,
      after: settle(applyAction(state, { type: "pass", player: me.id })),
    };
  }

  it("EBP01-043 5.15: in zone 4 or beyond, when you counter the opponent's monster, destroys their rank 6 or lower battle cards", () => {
    const { me, after } = run(4);
    expect(logTypes(after)).toContain("counter");
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "3": [963072] });
  });

  it("EBP01-043 12.4: before zone 4 it doesn't trigger", () => {
    const { me, after } = run(3);
    expect(logTypes(after)).toContain("counter");
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toEqual(["2", "3"]);
  });
});

describe("EBP01-045 Meganula", () => {
  it("EBP01-045 4.4.5.4: on enter in the opponent's monster's column with 2 battle cards in your zones, the opponent loses 1 rage", () => {
    const run = (zone: ZoneNumber) => {
      const { state, me, opp } = setup(3);
      opp.monsterPosition = 6; // same column as my zone 1 (4.4.5.4)
      opp.rage = 2;
      place(state, me, battleCard(), 2);
      return opponentOf(
        settle(play(state, me, inHand(state, me, real("EBP01-045")), zone)),
        me,
      ).rage;
    };
    expect(run(1)).toBe(1);
    expect(run(4)).toBe(2);
  });
});

describe("EBP01 draw-then-discard cards", () => {
  it.each([
    ["EBP01-047", 1, 4],
    ["EBP01-055", 1, 4],
    ["EBP01-069", 2, 6],
  ] as const)(
    "%s 5.4, 5.7.1: on enter, draw %i then discard as many",
    (number, count, position) => {
      const { state, me } = setup(position as ZoneNumber);
      const card = inHand(state, me, real(number));
      const hand = me.hand.length - 1;
      const after = settle(play(state, me, card, 8));
      expect(self(after, me).hand).toHaveLength(hand);
      expect(logTypes(after).filter((t) => t === "discard")).toHaveLength(
        count,
      );
    },
  );

  it("EBP01-069 12.4: before zone 6 it doesn't trigger", () => {
    const { state, me } = setup(5);
    const after = settle(
      play(state, me, inHand(state, me, real("EBP01-069")), 8),
    );
    expect(newLogTypes(after, state)).not.toContain("draw");
  });
});

describe("EBP01-049 / EBP01-054 Destoroyah", () => {
  it("EBP01-054 12.6.2: played through Evolution, it draws 2 then discards 2", () => {
    let state = runTo(atPlayTiming(), "7.3.1", 400);
    const me = turnPlayer(state);
    nonTurnPlayer(state).monsterPosition = 4;
    place(state, me, real("EBP01-049"), 2);
    onDeck(state, me, real("EBP01-054"));
    const hand = me.hand.length;
    state = settle(state);
    expect(zoneCardIds(self(state, me))).toEqual({
      "2": [real("EBP01-054").id],
    });
    expect(self(state, me).hand).toHaveLength(hand);
    expect(logTypes(state)).toContain("evolve");
    expect(logTypes(state).filter((t) => t === "discard")).toHaveLength(2);
  });

  it("EBP01-054 12.2: played from the hand it doesn't draw", () => {
    const { state, me } = setup(6);
    const after = settle(
      play(state, me, inHand(state, me, real("EBP01-054")), 2),
    );
    expect(newLogTypes(after, state)).toContain("conditionNotMet");
    expect(newLogTypes(after, state)).not.toContain("draw");
  });
});

describe("EBP01-061 Scale Attack", () => {
  it("EBP01-061 3.4: with 5 or more rage, the opponent loses 3", () => {
    const run = (rage: number) => {
      const { state, me, opp } = setup();
      opp.rage = rage;
      return opponentOf(
        settle(activate(state, me, inHand(state, me, real("EBP01-061")))),
        me,
      ).rage;
    };
    expect(run(5)).toBe(2);
    expect(run(4)).toBe(4);
  });
});

describe("EBP01-065 Godzilla vs. Destoroyah", () => {
  it("EBP01-065 5.12: destroys every opponent battle card in zones 1-5", () => {
    const { state, me, opp } = setup();
    place(state, opp, battleCard({ id: 963081 }), 2);
    place(state, opp, battleCard({ id: 963082, rank: 9 }), 5);
    place(state, opp, battleCard({ id: 963083 }), 6);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP01-065"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "6": [963083] });
  });
});

describe("EBP01-071 Giant Condor", () => {
  it("EBP01-071 3.4: when the opponent's rage goes up, it is destroyed", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP01-071"), 2);
    const after = settle(
      gainRage(state, opp, inHand(state, opp, monsterCard(2))),
    );
    expect(zoneCardIds(self(after, me))).toEqual({});
  });
});

describe("EBP01-076 Destroy All Monsters", () => {
  it("EBP01-076 10.6.5: when your monster invades this turn, destroys 1 opponent battle card, even after the card leaves its zone (T8)", () => {
    const { state, me, opp } = setup();
    place(state, opp, battleCard({ id: 963091, rank: 9 }), 2);
    let after = settle(
      activate(state, me, inHand(state, me, real("EBP01-076"))),
    );
    expect(logTypes(after)).toContain("delayedAbility");
    // Remove the card from its strategy zone: the created ability still applies.
    self(after, me).strategyZones[0] = [];
    const attacker = self(after, me);
    after = settle(invade(after, attacker, invader(after, attacker)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("EBP01-076 7.5.6: the created ability ends with the turn", () => {
    const { state, me } = setup();
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP01-076"))),
    );
    expect(after.timedTriggers).toHaveLength(1);
    expect(runTo(after, "7.5.7").timedTriggers).toEqual([]);
  });
});

describe("EBP01-079 Gravity Beam", () => {
  it("EBP01-079 5.7.2: the opponent discards down to 3", () => {
    const { state, me, opp } = setup();
    while (opp.hand.length < 6) inHand(state, opp, battleCard());
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP01-079"))),
    );
    expect(opponentOf(after, me).hand).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------------------------
// The M12a-1 format pieces on their own, with fixture abilities.

describe("M12a-1 format pieces", () => {
  const numbers: string[] = [];
  afterEach(() => {
    for (const n of numbers.splice(0)) setTestAbilities(n, null);
  });
  function withData(card: Card, abilities: CardAbilities["abilities"]): Card {
    numbers.push(card.deckCardNumber);
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities,
    });
    return card;
  }
  const draw = [{ effect: "draw" as const, player: "you" as const, count: 1 }];

  it("C5 2.5, 2.10: selectors filter by counter power, any of several traits, part of the name and the invasion icon", () => {
    const { state, me, opp } = setup();
    const strategy = withData(strategyCard(), [
      {
        kind: "triggered",
        id: "destroy",
        trigger: { on: "placedInStrategyZone" },
        effects: [
          {
            effect: "destroy",
            target: {
              select: {
                owner: "opponent",
                area: "zones",
                counterPower: { op: "<=", value: 2000 },
                anyTraits: ["Gigan", "Megalon"],
                nameIncludes: "MB",
                invadeIcon: 2,
              },
              count: "all",
              chooser: "you",
            },
          },
        ],
      },
    ]);
    const hit = {
      name: "MBT test",
      traits: ["Megalon"],
      invadeZones: 2,
      counterOrThreat: 2000,
    };
    place(state, opp, battleCard({ id: 964001, ...hit }), 2);
    place(
      state,
      opp,
      battleCard({ id: 964002, ...hit, counterOrThreat: 3000 }),
      3,
    );
    place(
      state,
      opp,
      battleCard({ id: 964003, ...hit, traits: ["Mothra"] }),
      5,
    );
    place(state, opp, battleCard({ id: 964004, ...hit, name: "Test" }), 6);
    place(state, opp, battleCard({ id: 964005, ...hit, invadeZones: 1 }), 7);
    const after = settle(activate(state, me, inHand(state, me, strategy)));
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toEqual([
      "3",
      "5",
      "6",
      "7",
    ]);
  });

  it("C5 3.3.4: a threat filter reads the invading monster's threat, rage included", () => {
    const { state, me, opp } = setup();
    const strategy = withData(strategyCard(), [
      {
        kind: "triggered",
        id: "draw",
        trigger: { on: "placedInStrategyZone" },
        condition: {
          count: {
            owner: "opponent",
            area: "monster",
            threat: { op: "<=", value: 10000 },
          },
          op: ">=",
          value: 1,
        },
        effects: draw,
      },
    ]);
    // The fixture rank I monster has 6,000 threat; 1 rage makes it 11,000 (3.4.5).
    opp.rage = 1;
    const card = inHand(state, me, strategy);
    const hand = me.hand.length - 1;
    expect(self(settle(activate(state, me, card)), me).hand).toHaveLength(hand);
    opp.rage = 0;
    expect(self(settle(activate(state, me, card)), me).hand).toHaveLength(
      hand + 1,
    );
  });

  it("C6 10.8.1: amounts read the monster's rank and empty zones; a count can be an amount", () => {
    const { state, me, opp } = setup();
    const strategy = withData(strategyCard(), [
      {
        kind: "triggered",
        id: "destroy",
        trigger: { on: "placedInStrategyZone" },
        effects: [
          {
            effect: "destroy",
            target: {
              select: { owner: "opponent", area: "zones" },
              count: { exact: { rageOf: "you", times: 1 } },
              chooser: "you",
            },
          },
          {
            effect: "draw",
            player: "you",
            count: { monsterRankOf: "opponent", times: 2 },
          },
        ],
      },
    ]);
    me.rage = 2;
    for (const zone of [2, 3, 5] as ZoneNumber[])
      place(state, opp, battleCard(), zone);
    const card = inHand(state, me, strategy);
    const hand = me.hand.length - 1;
    const after = settle(activate(state, me, card));
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toHaveLength(1);
    // The opponent's rank I monster: draw 1 x 2.
    expect(self(after, me).hand).toHaveLength(hand + 2);
    const zones = withData(battleCard(), [
      {
        kind: "continuous",
        id: "cp",
        modifiers: [
          {
            stat: "counterPower",
            target: { owner: "you", area: "zones", this: true },
            amount: { unoccupiedZonesOf: "you", times: 1000 },
          },
        ],
      },
    ]);
    const fresh = setup(1);
    const placed = place(fresh.state, fresh.me, zones, 2);
    // 8 zones minus zone 2 (this card) minus zone 1 (the monster's zone).
    expect(getCounterPower(fresh.state, placed)).toBe(1000 + 6000);
  });

  it("T1 5.12, 11.5: destroyed triggers read the cause, whose effect, and bind the card's last known rank", () => {
    const { state, me, opp } = opponentsTurn();
    const watcher = withData(battleCard({ id: 964010 }), [
      {
        kind: "triggered",
        id: "by-opponent",
        trigger: {
          on: "destroyed",
          what: { owner: "you", area: "zones", type: "Battle" },
          by: "opponent",
          as: "lost",
        },
        effects: [
          {
            effect: "destroy",
            target: {
              select: {
                owner: "opponent",
                area: "zones",
                rank: { op: "<=", value: { ref: "lost", field: "rank" } },
              },
              count: "all",
              chooser: "you",
            },
          },
        ],
      },
      {
        kind: "triggered",
        id: "overload",
        trigger: {
          on: "destroyed",
          what: { owner: "opponent", area: "zones" },
          cause: "overload",
        },
        effects: draw,
      },
    ]);
    place(state, me, watcher, 7);
    place(state, me, battleCard({ id: 964011, rank: 3 }), 2);
    place(state, opp, battleCard({ id: 964012, rank: 3 }), 6);
    place(state, opp, battleCard({ id: 964013, rank: 4 }), 7);
    // The opponent destroys my rank 3 card with an effect: I destroy their rank 3 or lower.
    const killer = withData(strategyCard(), [
      {
        kind: "triggered",
        id: "kill",
        trigger: { on: "placedInStrategyZone" },
        effects: [
          {
            effect: "destroy",
            target: {
              select: {
                owner: "opponent",
                area: "zones",
                rank: { op: "=", value: 3 },
              },
              count: "all",
              chooser: "you",
            },
          },
        ],
      },
    ]);
    let after = settle(activate(state, opp, inHand(state, opp, killer)));
    expect(zoneCardIds(self(after, me))).toEqual({ "7": [964010] });
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "7": [964013] });
    // The opponent overloads their own zone 7 (11.5): my watcher draws.
    const hand = self(after, me).hand.length;
    const attacker = opponentOf(after, me);
    after = settle(
      play(after, attacker, inHand(after, attacker, battleCard()), 7),
    );
    expect(self(after, me).hand).toHaveLength(hand + 1);
  });

  it("T3 5.7.1, 10.3.4: a card active in the discard pile triggers when discarded from the hand by the opponent's effect, not by your own invasion", () => {
    const { state, me, opp } = opponentsTurn();
    const fire = withData(battleCard({ id: 964020 }), [
      {
        kind: "triggered",
        id: "discarded",
        activeIn: ["discard"],
        trigger: {
          on: "discarded",
          what: { owner: "you", area: "discard", this: true },
          from: "hand",
          byOpponentEffect: true,
        },
        effects: draw,
      },
    ]);
    while (me.hand.length > 3) me.deck.push(me.hand.pop() as CardInstance);
    inHand(state, me, fire);
    // Gravity Beam: discard down to 3; I pick the fixture card.
    let after = activate(state, opp, inHand(state, opp, real("EBP01-079")));
    after = choose(after, (_, cardId) => cardId === 964020);
    after = settle(after);
    expect(self(after, me).hand).toHaveLength(4);
    expect(self(after, me).discard.map((c) => c.cardId)).toContain(964020);
    // Discarded for my own invasion: no trigger.
    const mine = setup();
    const card = inHand(mine.state, mine.me, { ...fire, invadeZones: 1 });
    const hand = mine.me.hand.length - 1;
    expect(
      self(settle(invade(mine.state, mine.me, card)), mine.me).hand,
    ).toHaveLength(hand);
  });

  it("T4 5.15: a countered trigger fires for `this` monster when it is countered", () => {
    const { state, me, opp } = opponentsTurn();
    monster(
      state,
      me,
      withData(monsterCard(1, { id: 964030 }), [
        {
          kind: "triggered",
          id: "countered",
          trigger: { on: "countered", whose: "this" },
          effects: draw,
        },
      ]),
      2,
    );
    place(state, opp, battleCard({ counterOrThreat: 99000 }), 2);
    const hand = me.hand.length;
    const after = settleUntil(
      applyAction(state, { type: "pass", player: opp.id }),
      "7.5.1",
    );
    expect(logTypes(after)).toContain("counter");
    expect(self(after, me).hand).toHaveLength(hand + 1);
  });

  it("T5 5.13.1, 4.4.5.4: an advanced trigger can ask for the opponent's monster's column and a phase", () => {
    const { state, me, opp } = setup(4);
    monster(
      state,
      me,
      withData(monsterCard(1, { id: 964040 }), [
        {
          kind: "triggered",
          id: "column",
          trigger: {
            on: "advanced",
            whose: "this",
            intoColumnOf: "opponentMonster",
            during: "end",
          },
          effects: draw,
        },
      ]),
      4,
    );
    // My zone 5 is in the same column as the opponent's zone 1 (4.4.5.4).
    opp.monsterPosition = 1;
    const hand = me.hand.length;
    const viaInvasion = settle(invade(state, me, invader(state, me)));
    // An invasion advance is not in the end phase: no draw.
    expect(self(viaInvasion, me).hand).toHaveLength(hand);
    const viaEndPhase = runTo(state, "7.5.3");
    expect(logTypes(viaEndPhase)).toContain("enterStandby");
  });

  it('T8 10.6.5.1: a delayed ability fires each time within its period ("this turn")', () => {
    const { state, me } = setup();
    const strategy = withData(strategyCard(), [
      {
        kind: "triggered",
        id: "until",
        trigger: { on: "placedInStrategyZone" },
        effects: [
          {
            effect: "until",
            duration: "endOfTurn",
            abilities: [
              {
                kind: "triggered",
                id: "rage-draw",
                trigger: {
                  on: "rageChanged",
                  whose: "you",
                  change: "increased",
                },
                effects: draw,
              },
            ],
          },
        ],
      },
    ]);
    let after = settle(activate(state, me, inHand(state, me, strategy)));
    const hand = self(after, me).hand.length;
    for (let i = 0; i < 2; i++) {
      const player = self(after, me);
      after = settle(
        gainRage(after, player, inHand(after, player, monsterCard(2))),
      );
    }
    // Two rage gains, two draws: the timed trigger is not limited to once (10.6.5.1).
    expect(self(after, me).hand).toHaveLength(hand + 2);
  });

  it("T6 5.14.1, 8.6: an invades trigger fires once per invasion, and `intoZones` needs the monster to enter one of them", () => {
    const run = (from: ZoneNumber, icon: number) => {
      const { state, me } = setup(from);
      place(
        state,
        me,
        withData(battleCard({ id: 964050 + from }), [
          {
            kind: "triggered",
            id: "invades",
            trigger: { on: "invades", whose: "any", intoZones: [6, 7, 8] },
            effects: draw,
          },
        ]),
        1,
      );
      const after = settle(invade(state, me, invader(state, me, icon)));
      return logTypes(after).filter((t) => t === "enterStandby").length;
    };
    expect(run(4, 2)).toBe(1);
    expect(run(3, 2)).toBe(0);
  });
});
