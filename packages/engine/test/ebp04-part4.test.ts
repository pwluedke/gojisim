import type { Card, CardAbilities } from "@gojisim/cards";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advanceToDecision,
  applyAction,
  cardChanges,
  getCounterPower,
  getLegalActions,
  getRank,
  nextMonsterCandidates,
  type GameState,
  type PlayerState,
} from "../src";
import { counterMonster } from "../src/counter";
import { checkInvariants } from "../src/invariants";
import { setTestAbilities } from "../src/testing";
import {
  DECK_PLAYER,
  inStrategy,
  pass,
  playFixture,
  useFixtures,
} from "./fixtures/ebp04";
import {
  choose,
  godzilla,
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

// M12d-2: the rest of EBP04 (docs/abilities/m12-plan.md): T9, M3, the Q22/Q23 monster plays,
// EBP04-045's play cost, EBP04-010's rage replacement and the three custom handlers.

useFixtures();

/** A battle card whose [enter] returns 1 card from its player's discard pile to their hand. */
const RETURNER = battleCard({ id: 964910, rank: 1 });
const RETURNER_DATA: CardAbilities = {
  deckCardNumber: RETURNER.deckCardNumber,
  status: "implemented",
  abilities: [
    {
      kind: "triggered",
      id: "enter",
      trigger: { on: "enter" },
      effects: [
        {
          effect: "addToHand",
          target: { owner: "you", area: "discard" },
          count: { exact: 1 },
        },
      ],
    },
  ],
};
beforeAll(() => setTestAbilities(RETURNER.deckCardNumber, RETURNER_DATA));
afterAll(() => setTestAbilities(RETURNER.deckCardNumber, null));

/** Runs from the opponent's turn into mine, stopping at 7.2.4's question or after it. */
function intoMyStartPhase(state: GameState): GameState {
  let current = pass(state);
  for (let i = 0; i < 300; i++) {
    current = advanceToDecision(current);
    const choice = current.pendingChoice;
    if (choice?.rule === "10.9" || current.result !== null) return current;
    if (choice) current = choose(current, (id) => id !== "done");
    else if (current.step === "7.3.2") return current;
  }
  throw new Error("never reached my start phase");
}

const handIds = (player: PlayerState) => player.hand.map((c) => c.cardId);

describe("EBP04-010 Godzilla (2023): E21 rageReset", () => {
  const run = (rage: number, hand: number) => {
    const { state, me } = opponentsTurn();
    monster(state, me, real("EBP04-010"), 3);
    me.rage = rage;
    me.hand = [];
    for (let i = 0; i < hand; i++) inHand(state, me, battleCard());
    return { state: intoMyStartPhase(state), me };
  };

  it("10.9, 7.2.4, Q16: with 2 or more rage it asks; yes discards 2 picked cards and sets rage to 2 instead of 0", () => {
    const { state, me } = run(4, 3);
    expect(state.pendingChoice?.kind).toBe("confirm");
    expect(state.step).toBe("7.2.4");
    let after = advanceToDecision(choose(state, (id) => id === "yes"));
    // The 7.2.2 draw added a card: 4 in hand, so the 2 discards are picked.
    expect(after.pendingChoice?.kind).toBe("target");
    after = choose(after, () => true);
    after = choose(after, () => true);
    after = advanceToDecision(after);
    const mine = self(after, me);
    expect(mine.rage).toBe(2);
    expect(mine.hand).toHaveLength(2);
    expect(newLogTypes(after, state)).toContain("replace");
    // No 7.2.4 reset this turn (earlier turns' resets are in the log too).
    expect(
      after.log
        .slice(state.log.length)
        .some((e) => e.type === "setRage" && e.payload["rule"] === "7.2.4"),
    ).toBe(false);
    expect(after.step).toBe("7.3.2");
    checkInvariants(after);
  });

  it("10.9, 7.2.4: no keeps the reset to 0", () => {
    const { state, me } = run(4, 3);
    const after = advanceToDecision(choose(state, (id) => id === "no"));
    expect(self(after, me).rage).toBe(0);
    expect(self(after, me).hand).toHaveLength(4);
  });

  it("7.2.4, 10.5.4.1: with 1 rage, or fewer than 2 cards to discard, nothing is asked", () => {
    expect(run(1, 3).state.pendingChoice).toBeNull();
    expect(self(run(1, 3).state, run(1, 3).me).rage).toBe(0);
    // An empty hand draws 1 at 7.2.2 (the opponent's monster is rank 1): still fewer than 2.
    const short = run(3, 0);
    expect(short.state.pendingChoice).toBeNull();
    expect(self(short.state, short.me).rage).toBe(0);
  });
});

describe("EBP04-012 Biollante Plant Beast Form: Q22 play from rank II", () => {
  const start = (traits = ["Biollante"]) => {
    const { state, me, opp } = setup(4);
    const rankII = monster(state, me, monsterCard(2, { traits }), 4);
    me.rage = 0;
    const rankIII = { ...monsterCard(3, { traits: ["Other"] }) };
    me.monsterDeck = [];
    const under = (() => {
      state.cards = { ...state.cards, [rankIII.id]: rankIII };
      const instance = {
        instanceId: `c${state.nextInstanceId++}`,
        cardId: rankIII.id,
        owner: me.id,
      };
      me.monsterDeck.push(instance);
      return instance;
    })();
    const card = inHand(state, me, real("EBP04-012"));
    return { state, me, opp, card, under, rankII };
  };

  it("8.5.1.1, Q22: played on a rank II Biollante with a rank III monster deck card placed under that card; rage +1; Tentacles in every adjacent zone", () => {
    const { state, me, card, under, rankII } = start();
    const action = getLegalActions(state, me.id).find(
      (a) => a.type === "playMonster" && a.cardInstanceId === card.instanceId,
    );
    expect(action).toEqual({
      type: "playMonster",
      player: me.id,
      cardInstanceId: card.instanceId,
      underInstanceId: under.instanceId,
    });
    const after = settle(applyAction(state, action as never));
    const mine = self(after, me);
    // The rank III card went under the rank II card, and this card on top (Q22).
    expect(mine.invadingMonsterZone.map((c) => c.cardId)).toEqual([
      under.cardId,
      rankII.cardId,
      real("EBP04-012").id,
    ]);
    expect(mine.monsterDeck).toHaveLength(0);
    expect(mine.rage).toBe(1);
    // Zone 4's neighbors on its own field: 3, 5 and 7.
    expect(Object.keys(zoneCardIds(mine)).sort()).toEqual(["3", "5", "7"]);
    expect(after.turnFlags.monsterPlayed).toBe(true);
    checkInvariants(after);
  });

  it("Q22: not offered onto a rank II monster without Biollante, or with no rank III card in the monster deck", () => {
    const other = start(["Godzilla"]);
    expect(
      getLegalActions(other.state, other.me.id).some(
        (a) => a.type === "playMonster",
      ),
    ).toBe(false);
    const empty = start();
    empty.me.monsterDeck = [];
    expect(
      getLegalActions(empty.state, empty.me.id).some(
        (a) => a.type === "playMonster",
      ),
    ).toBe(false);
  });
});

describe("EBP04-028, EBP04-066, EBP04-068: M3 rank modifiers on hand cards", () => {
  it("EBP04-028 8.3.1, 10.8: on the opponent's turn, strategy cards in their hand are 3 ranks higher, so a rank 3 can't be activated from zone 5", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP04-028"), 2);
    const strategy = inHand(state, opp, strategyCard({ rank: 3 }));
    expect(getRank(state, strategy)).toBe(6);
    expect(
      getLegalActions(state, opp.id).some(
        (a) =>
          a.type === "activateStrategy" &&
          a.cardInstanceId === strategy.instanceId,
      ),
    ).toBe(false);
  });

  it("EBP04-028 T7: on the opponent's turn, each battle card they play from their deck makes them discard 1", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, real("EBP04-028"), 2);
    opp.deck.unshift({
      instanceId: `c${state.nextInstanceId++}`,
      cardId: battleCard().id,
      owner: opp.id,
    });
    state.cards = {
      ...state.cards,
      [opp.deck[0]!.cardId]: battleCard({ id: opp.deck[0]!.cardId }),
    };
    const handBefore = opp.hand.length;
    const after = playFixture(state, opp, DECK_PLAYER);
    // The fixture left the hand (-1), and 1 more was discarded.
    expect(opponentOf(after, me).hand.length).toBe(handBefore - 1);
    expect(
      after.log.filter((e) => e.type === "discard" && e.player === opp.id),
    ).toHaveLength(1);
  });

  it("EBP04-066 8.3.1, C4: +2 only while you have a non-green battle card in your zones", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP04-066"), 2);
    const strategy = inHand(state, opp, strategyCard({ rank: 1 }));
    expect(getRank(state, strategy)).toBe(1);
    place(state, me, battleCard({ colors: ["Red"] }), 3);
    expect(getRank(state, strategy)).toBe(3);
  });

  it("EBP04-068 8.3.1, C4: on your turn with no strategy card in play, your hand's strategy cards are 1 rank lower per color among battle cards in your discard pile", () => {
    const { state, me } = setup(2);
    place(state, me, real("EBP04-068"), 3);
    inDiscard(state, me, battleCard({ colors: ["Red"] }));
    inDiscard(state, me, battleCard({ colors: ["Blue"] }));
    inDiscard(state, me, battleCard({ colors: ["Blue"] }));
    const strategy = inHand(state, me, strategyCard({ rank: 4 }));
    expect(getRank(state, strategy)).toBe(2);
    // From zone 2 (8.3.1), the rank 4 card can now be activated.
    expect(
      getLegalActions(state, me.id).some(
        (a) =>
          a.type === "activateStrategy" &&
          a.cardInstanceId === strategy.instanceId,
      ),
    ).toBe(true);
    inStrategy(state, me, strategyCard());
    expect(getRank(state, strategy)).toBe(4);
  });
});

describe("EBP04-033, EBP04-034 Kaizer Ghidorah: Q23 onto Monster X", () => {
  const start = (card: string, monsterX = true) => {
    const { state, me, opp } = setup(4);
    monster(state, me, monsterX ? real("EBP04-032") : godzilla(2), 4);
    me.rage = 0;
    for (const colors of [["Red"], ["Blue"], ["Green"]] as Card["colors"][])
      inDiscard(state, me, battleCard({ colors }));
    const kaizer = inHand(state, me, real(card));
    return { state, me, opp, kaizer };
  };

  it("8.5.1.1, Q23: played on top of a Monster X monster card, ignoring rank and trait; rage +1; with 3 colors in the discard pile EBP04-033 reduces the opponent's rage by 1", () => {
    const { state, me, opp, kaizer } = start("EBP04-033");
    opp.rage = 2;
    const after = settle(playMonster(state, me, kaizer));
    expect(self(after, me).invadingMonsterZone.at(-1)?.cardId).toBe(
      real("EBP04-033").id,
    );
    // Rage +1 for the monster play.
    expect(self(after, me).rage).toBe(1);
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("Q23: EBP04-034 destroys 1 of the opponent's rank 5 or lower battle cards", () => {
    const { state, me, opp, kaizer } = start("EBP04-034");
    place(state, opp, battleCard({ rank: 5 }), 2);
    place(state, opp, battleCard({ rank: 6 }), 3);
    const after = settle(playMonster(state, me, kaizer));
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toEqual(["3"]);
  });

  it("Q23: not playable on a monster without Monster X", () => {
    const { state, me, kaizer } = start("EBP04-033", false);
    expect(
      getLegalActions(state, me.id).some(
        (a) =>
          a.type === "playMonster" && a.cardInstanceId === kaizer.instanceId,
      ),
    ).toBe(false);
  });
});

describe("EBP04-033, EBP04-034 Kaizer Ghidorah: the next monster after a countered Monster X (5.15.1.2, Q23 as amended Oct 28, 2026)", () => {
  /** My invading monster in zone 6, about to be countered, with `deck` as the monster deck. */
  const start = (invading: string, deck: string[]) => {
    const { state, me } = setup(6);
    monster(state, me, real(invading), 6);
    me.monsterDeck = deck.map((n) => addCard(state, real(n), me.id));
    return { state, me };
  };
  const ids = (cards: { cardId: number }[]) => cards.map((c) => c.cardId);

  for (const kaizer of ["EBP04-033", "EBP04-034"])
    it(`5.15.1.2, Q23: Monster X II countered with ${kaizer} (rank III) in the monster deck: it becomes the invading monster, no loss`, () => {
      const { state, me } = start("EBP04-032", [kaizer, "EBP04-035"]);
      expect(ids(nextMonsterCandidates(state, me))).toEqual([real(kaizer).id]);
      counterMonster(state, me);
      expect(me.invadingMonsterZone.at(-1)?.cardId).toBe(real(kaizer).id);
      expect(state.pendingLosses).toEqual([]);
    });

  it("5.15.1.2, Q23: Monster X I countered: Kaizer Ghidorah III isn't offered (the rank must be II + 1)", () => {
    const { state, me } = start("EBP04-031", ["EBP04-033"]);
    expect(nextMonsterCandidates(state, me)).toEqual([]);
    counterMonster(state, me);
    expect(state.pendingLosses).toMatchObject([
      { player: me.id, rule: "5.15.1.2.1" },
    ]);
  });

  it("5.15.1.2.1: Monster X II countered with no Kaizer Ghidorah III: its master loses", () => {
    const { state, me } = start("EBP04-032", ["EBP04-035"]);
    counterMonster(state, me);
    expect(state.pendingLosses).toMatchObject([
      {
        player: me.id,
        reason: "victoryThroughCountering",
        rule: "5.15.1.2.1",
      },
    ]);
  });

  it("5.15.1.2: the next counter from Kaizer Ghidorah III goes to Kaizer Ghidorah IV through their shared trait", () => {
    const { state, me } = start("EBP04-032", ["EBP04-033", "EBP04-035"]);
    counterMonster(state, me);
    me.monsterPosition = 6;
    counterMonster(state, me);
    expect(me.invadingMonsterZone.at(-1)?.cardId).toBe(real("EBP04-035").id);
    expect(state.pendingLosses).toEqual([]);
  });

  it("Q23: the main phase play from the hand is unchanged (on Monster X at any rank)", () => {
    const { state, me } = start("EBP04-031", []);
    const kaizer = inHand(state, me, real("EBP04-033"));
    expect(
      getLegalActions(state, me.id).some(
        (a) =>
          a.type === "playMonster" && a.cardInstanceId === kaizer.instanceId,
      ),
    ).toBe(true);
  });
});

describe("EBP04-041 The New Gotengo: T9 and Awakening", () => {
  it("F13, Q30: at the beginning of your counter phase in zone 8, your monster card's [enter] abilities trigger again, conditions checked as usual", () => {
    const { state, me, opp } = setup(4);
    monster(state, me, real("EBP04-033"), 4);
    for (const colors of [["Red"], ["Blue"], ["Green"]] as Card["colors"][])
      inDiscard(state, me, battleCard({ colors }));
    place(state, me, real("EBP04-041"), 8);
    opp.rage = 3;
    const after = settleUntil(pass(state), "7.4.2");
    expect(after.log.some((e) => e.type === "retrigger")).toBe(true);
    expect(opponentOf(after, me).rage).toBe(2);
  });

  it("F13: not from another zone", () => {
    const { state, me, opp } = setup(4);
    monster(state, me, real("EBP04-033"), 4);
    place(state, me, real("EBP04-041"), 7);
    opp.rage = 3;
    const after = settleUntil(pass(state), "7.4.2");
    expect(after.log.some((e) => e.type === "retrigger")).toBe(false);
  });

  it("12.4 Awakening 6: +3000 counter power while your monster is in zone 6 or beyond", () => {
    const { state, me } = setup(5);
    const gotengo = place(state, me, real("EBP04-041"), 2);
    expect(getCounterPower(state, gotengo)).toBe(4000);
    me.monsterPosition = 6;
    expect(getCounterPower(state, gotengo)).toBe(7000);
  });
});

describe("EBP04-045 Manda (2004): M2 play cost", () => {
  const start = (payColors: Card["colors"]) => {
    const { state, me, opp } = setup(4);
    // The opponent's monster in zone 1: only rank 1 battle cards can be played (8.2.1).
    opp.monsterPosition = 1;
    me.hand = [];
    const manda = inHand(state, me, real("EBP04-045"));
    const pay = inHand(state, me, battleCard({ colors: payColors }));
    return { state, me, manda, pay };
  };

  it("8.2.1, 10.5.4: discarding a non-blue battle card plays it with its rank reduced by 2", () => {
    const { state, me, manda, pay } = start(["Red"]);
    const plays = getLegalActions(state, me.id).filter(
      (a) => a.type === "playBattle" && a.cardInstanceId === manda.instanceId,
    );
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((a) => "costCardInstanceId" in a)).toBe(true);
    const after = settle(applyAction(state, plays[0] as never));
    const discard = after.log.find(
      (e) => e.type === "discard" && e.payload["cost"] === true,
    );
    expect(discard?.payload["cardId"]).toBe(pay.cardId);
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      real("EBP04-045").id,
    );
  });

  it("8.2.1: a blue card can't pay; with no payment the rank 3 card can't be played", () => {
    const { state, me, manda } = start(["Blue"]);
    expect(
      getLegalActions(state, me.id).some(
        (a) => a.type === "playBattle" && a.cardInstanceId === manda.instanceId,
      ),
    ).toBe(false);
  });
});

describe("EBP04-067 Godzilla Earth: zone 8 only, and its linked token", () => {
  const start = (position: 3 | 4 = 4) => {
    const { state, me, opp } = setup(position);
    const earth = inHand(state, me, real("EBP04-067"));
    return { state, me, opp, earth };
  };

  it("M2: it can only be played in zone 8", () => {
    const { state, me, earth } = start();
    const zones = getLegalActions(state, me.id).flatMap((a) =>
      a.type === "playBattle" && a.cardInstanceId === earth.instanceId
        ? [a.zone]
        : [],
    );
    expect(zones).toEqual([8]);
  });

  it("9.1.2, 11.5: [enter] plays a Godzilla Earth token in zone 3; when the token leaves its zone, this card is destroyed too", () => {
    const { state, me, earth } = start();
    let after = settle(play(state, me, earth, 8));
    expect(zoneCardIds(self(after, me))).toEqual({
      "3": [real("EBP04-T01").id],
      "8": [real("EBP04-067").id],
    });
    expect(after.continuousEffects.some((e) => e.link)).toBe(true);
    // Both cards show the link (a public status).
    for (const zone of [3, 8] as const) {
      const card = self(after, me).zones[zone][0]?.[0];
      expect(
        cardChanges(after, card?.instanceId ?? "").map((c) => c.label),
      ).toContain("Linked");
    }
    // Another battle card in zone 3: overload destroys the older card there, the token (11.5).
    const other = battleCard({ rank: 1 });
    after = settle(
      play(after, self(after, me), inHand(after, self(after, me), other), 3),
    );
    expect(zoneCardIds(self(after, me))).toEqual({ "3": [other.id] });
    expect(after.continuousEffects.some((e) => e.link)).toBe(false);
    expect(newLogTypes(after, state)).toContain("linkBroken");
    checkInvariants(after);
  });

  it("Q28: with your monster in zone 3, no token and no link", () => {
    const { state, me, earth } = start(3);
    const after = settle(play(state, me, earth, 8));
    expect(zoneCardIds(self(after, me))).toEqual({
      "8": [real("EBP04-067").id],
    });
    expect(after.continuousEffects.some((e) => e.link)).toBe(false);
  });
});

describe("EBP04-073 Gaira: returnedToHand", () => {
  it("in zone 1, when the opponent returns a card from their discard pile to their hand on their turn, you may return up to 1 card from yours", () => {
    const { state, me, opp } = opponentsTurn();
    // My monster away from zone 1, or it crushes Gaira there (11.3).
    me.monsterPosition = 4;
    place(state, me, real("EBP04-073"), 1);
    me.discard = [];
    const mine = inDiscard(state, me, battleCard());
    inDiscard(state, opp, battleCard());
    const after = playFixture(state, opp, RETURNER);
    expect(handIds(self(after, me))).toContain(mine.cardId);
  });

  it("not from another zone", () => {
    const { state, me, opp } = opponentsTurn();
    me.monsterPosition = 4;
    place(state, me, real("EBP04-073"), 2);
    me.discard = [];
    const mine = inDiscard(state, me, battleCard());
    inDiscard(state, opp, battleCard());
    const after = playFixture(state, opp, RETURNER);
    expect(handIds(self(after, me))).not.toContain(mine.cardId);
  });
});

describe("EBP04-089 Inherited Life: Q11 rage count, Q25", () => {
  const start = (rage: number) => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 3);
    inStrategy(state, me, real("EBP04-089"));
    // Placed on an earlier turn: without its rule it would go at 7.2.3.
    me.strategyZones[0]![0]!.placedOnTurn = state.turn - 2;
    me.rage = rage;
    return { state, me, opp };
  };
  const count = (state: GameState) =>
    state.continuousEffects.find((e) => e.counter)?.counter?.count ?? 0;

  it("7.2.3, Q25: it stays in its strategy zone at the start phase, and the 7.2.4 reset places that many rage under it", () => {
    const { state, me } = start(4);
    const after = intoMyStartPhase(state);
    expect(self(after, me).strategyZones[0]).toHaveLength(1);
    expect(count(after)).toBe(4);
    const life = self(after, me).strategyZones[0]?.[0]?.card;
    expect(
      cardChanges(after, life?.instanceId ?? "").map((c) => c.label),
    ).toEqual(expect.arrayContaining(["Stays", "Rage under 4"]));
  });

  it("Q11: the 15th card destroys all of the opponent's battle cards", () => {
    const { state, me, opp } = start(15);
    place(state, opp, battleCard(), 2);
    place(state, opp, battleCard(), 4);
    const after = intoMyStartPhase(state);
    expect(count(after)).toBe(15);
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("Q11: the 22nd card empties the opponent's hand; the 30th wins the game (1.2.4)", () => {
    const { state, me } = start(22);
    state.continuousEffects.push({
      effectId: "counter:test",
      timestamp: 0,
      duration: "permanent",
      counter: {
        instanceId: me.strategyZones[0]![0]!.card.instanceId,
        count: 8,
      },
    });
    const after = intoMyStartPhase(state);
    expect(after.result).toEqual({
      winner: me.id,
      reason: "effect",
      rule: expect.any(String),
    });
    expect(count(after)).toBe(30);
    expect(opponentOf(after, me).hand).toHaveLength(0);
  });
});
