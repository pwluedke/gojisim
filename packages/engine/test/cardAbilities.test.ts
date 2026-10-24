import { type Card, getCardAbilities } from "@gojisim/cards";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import {
  applyAction,
  counterPowerOf,
  type GameState,
  getCounterPower,
  getLegalActions,
  getThreat,
  type ZoneNumber,
} from "../src";
import { registerCustomEffect, setTestAbilities } from "../src/testing";
import {
  addCard,
  battleCard,
  logTypes,
  monsterCard,
  newGame,
  nonTurnPlayer,
  runTo,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";
import {
  atPlayTiming,
  inHand,
  monster,
  place,
  real,
  zoneCardIds,
} from "./fixtures/real";

describe("cards with no ability text (format.md: abilities: [])", () => {
  it.each(["ESD01-001", "ESD01-008", "ESD02-001", "ESD02-013"])(
    "%s 10.1: implemented with no abilities",
    (number) => {
      expect(getCardAbilities(number)).toMatchObject({
        status: "implemented",
        abilities: [],
      });
    },
  );
});

describe("ESD01-003 Godzilla (2023)", () => {
  it("ESD01-003 10.8.1: +5,000 threat while it has 2 or more rage, on top of +5,000 per rage (3.4.5)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, real("ESD01-003"), 3);
    me.rage = 1;
    expect(getThreat(state, me.id)).toBe(23000 + 5000);
    me.rage = 2;
    expect(getThreat(state, me.id)).toBe(23000 + 10000 + 5000);
  });
});

describe("ESD01-009 Reinforcements", () => {
  it("ESD01-009 12.4: +3,000 counter power while its monster is in zone 4 or beyond", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const card = place(state, me, real("ESD01-009"), 2);
    me.monsterPosition = 3;
    expect(getCounterPower(state, card)).toBe(2000);
    me.monsterPosition = 4;
    expect(getCounterPower(state, card)).toBe(5000);
    // 7.4.2 totals through getCounterPower.
    expect(counterPowerOf(state, me)).toBe(5000);
  });
});

describe("ESD01-010 City of Tokyo", () => {
  function setup(rage: number, position: ZoneNumber) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.rage = rage;
    me.monsterPosition = position;
    const city = place(state, me, real("ESD01-010"), 2);
    const target = place(state, me, battleCard({ counterOrThreat: 1000 }), 8);
    return { state, me, city, target };
  }

  it("ESD01-010 10.8.1: +5,000 to your other battle card in zone 8 while your monster has 2 or more rage", () => {
    const { state, target } = setup(2, 1);
    expect(getCounterPower(state, target)).toBe(6000);
    const off = setup(1, 1);
    expect(getCounterPower(off.state, off.target)).toBe(1000);
  });

  it("ESD01-010 12.4: +5,000 to your other battle card in zone 8 while your monster is in zone 6 or beyond", () => {
    const on = setup(0, 6);
    expect(getCounterPower(on.state, on.target)).toBe(6000);
    const off = setup(0, 5);
    expect(getCounterPower(off.state, off.target)).toBe(1000);
  });

  it("ESD01-010 Q6: the two bonuses stack to +10,000 on another zone 8 card", () => {
    const { state, me, target } = setup(2, 6);
    expect(getCounterPower(state, target)).toBe(11000);
    expect(counterPowerOf(state, me)).toBe(11000);
  });

  it("ESD01-010 Q6: in zone 8 it gives no bonus to itself", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.rage = 2;
    me.monsterPosition = 6;
    const city = place(state, me, real("ESD01-010"), 8);
    expect(getCounterPower(state, city)).toBe(0);
  });
});

describe("ESD01-016 Heat Ray", () => {
  it("ESD01-016 4.4.5.4: destroys every opponent battle card in the same column as your monster, on placement (10.1.1.1.2)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    me.monsterPosition = 3; // same column as the opponent's zones 3 and 8
    opp.monsterPosition = 1;
    for (const zone of [3, 8, 4, 2] as ZoneNumber[])
      place(state, opp, battleCard({ id: 960000 + zone }), zone);
    const heatRay = inHand(state, me, real("ESD01-016"));
    const after = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: heatRay.instanceId,
      strategyZone: 1,
    });
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({
      "2": [960002],
      "4": [960004],
    });
    expect(logTypes(after)).not.toContain("strategyTextPending");
  });

  it("a manual strategy card still logs strategyTextPending (no data yet)", () => {
    // EBP01-032 has data from M12a-1; treated as manual here.
    setTestAbilities("EBP01-032", {
      deckCardNumber: "EBP01-032",
      status: "manual",
      abilities: [],
    });
    onTestFinished(() => setTestAbilities("EBP01-032", null));
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 8;
    const manual = inHand(state, me, real("EBP01-032"));
    const after = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: manual.instanceId,
      strategyZone: 1,
    });
    expect(logTypes(after)).toContain("strategyTextPending");
  });
});

describe("ESD02-002 Godzilla (1989)", () => {
  function playIt(targets: Card[]) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    // 8.5.1: a monster card of the same rank, sharing a trait.
    monster(state, me, monsterCard(2, { traits: ["Godzilla"] }), 2);
    targets.forEach((card, i) =>
      place(state, opp, card, (i + 2) as ZoneNumber),
    );
    const card = inHand(state, me, real("ESD02-002"));
    return applyAction(state, {
      type: "playMonster",
      player: me.id,
      cardInstanceId: card.instanceId,
    });
  }

  it("ESD02-002 12.2: on enter, destroys 1 of the opponent's rank 4 or lower battle cards; the only legal target needs no choice (10.5.3.1)", () => {
    const after = playIt([
      battleCard({ id: 961001, rank: 4 }),
      battleCard({ id: 961002, rank: 5 }),
    ]);
    expect(after.pendingChoice).toBeNull();
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({ "3": [961002] });
  });

  it("ESD02-002 10.5.3: with several legal targets, its master chooses one", () => {
    const paused = playIt([
      battleCard({ id: 961011, rank: 1 }),
      battleCard({ id: 961012, rank: 3 }),
    ]);
    expect(paused.pendingChoice).toMatchObject({
      player: paused.turnPlayer,
      kind: "target",
      rule: "10.5.3",
    });
    const option = paused.pendingChoice?.options.find(
      (o) => o.cardId === 961012,
    );
    const after = applyAction(paused, {
      type: "choose",
      player: paused.turnPlayer,
      choiceId: paused.pendingChoice?.id ?? 0,
      optionId: option?.id ?? "",
    });
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({ "2": [961011] });
    expect(after.resolution).toBeNull();
    expect(after.step).toBe("7.3.2");
  });
});

describe("ESD02-006 Godzilla (1995)", () => {
  it("ESD02-006 10.8.1: +5,000 threat per strategy card the opponent has in play", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, me, real("ESD02-006"), 4);
    expect(getThreat(state, me.id)).toBe(36000);
    opp.strategyZones[0].push({
      card: addCard(state, strategyCard(), opp.id),
      placedOnTurn: 1,
    });
    expect(getThreat(state, me.id)).toBe(41000);
    opp.strategyZones[1].push({
      card: addCard(state, strategyCard(), opp.id),
      placedOnTurn: 1,
    });
    expect(getThreat(state, me.id)).toBe(46000);
  });
});

describe("ESD02-009 Super-X", () => {
  function playTo(position: ZoneNumber, zone: ZoneNumber) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    me.monsterPosition = position;
    opp.monsterPosition = 8;
    opp.rage = 2;
    const card = inHand(state, me, real("ESD02-009"));
    return applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone,
    });
  }

  it("ESD02-009 12.4: only triggers if its monster is in zone 4 or beyond and Super-X is in zone 8", () => {
    expect(nonTurnPlayer(playTo(4, 8)).rage).toBe(1);
    const early = playTo(3, 8);
    expect(nonTurnPlayer(early).rage).toBe(2);
    expect(logTypes(early)).not.toContain("enterStandby");
    const elsewhere = playTo(4, 7);
    expect(nonTurnPlayer(elsewhere).rage).toBe(2);
    expect(logTypes(elsewhere)).toContain("conditionNotMet");
  });

  it("ESD02-009 3.4.4: the opponent's rage does not go below 0", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    me.monsterPosition = 4;
    opp.monsterPosition = 8;
    opp.rage = 0;
    const card = inHand(state, me, real("ESD02-009"));
    const after = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone: 8,
    });
    expect(nonTurnPlayer(after).rage).toBe(0);
    // No change is no rageChanged event (1.3.2.1).
    expect(logTypes(after)).not.toContain("rageChanged");
    expect(
      after.log.find((e) => e.type === "rageUnchanged")?.payload,
    ).toMatchObject({ rule: "1.3.2.1", from: 0, to: 0 });
  });
});

describe("ESD02-011 Battra (Imago)", () => {
  it("ESD02-011 12.4: +3,000 counter power while its monster is in zone 6 or beyond", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const card = place(state, me, real("ESD02-011"), 2);
    me.monsterPosition = 5;
    expect(getCounterPower(state, card)).toBe(5000);
    me.monsterPosition = 6;
    expect(getCounterPower(state, card)).toBe(8000);
  });
});

describe("ESD02-012 Mechagodzilla (1993)", () => {
  function setup(opponentRank: number, zone: ZoneNumber) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, opp, real(`ESD02-00${opponentRank === 4 ? 6 : 2}`), 5); // rank IV or rank II
    const card = place(state, me, real("ESD02-012"), zone);
    return getCounterPower(state, card);
  }

  it("ESD02-012 10.8.1: +5,000 while the opponent's monster is rank IV or higher", () => {
    expect(setup(4, 2)).toBe(10000);
    expect(setup(2, 2)).toBe(5000);
  });

  it("ESD02-012 4.4.5.4: +3,000 while it is in the same column as the opponent's monster", () => {
    // The opponent's monster is in their zone 5: same column as my zone 1.
    expect(setup(2, 1)).toBe(8000);
  });

  it("ESD02-012 10.8.1: the two conditions stack to +8,000", () => {
    expect(setup(4, 1)).toBe(13000);
  });
});

describe("ESD02-015 Burning Godzilla's Rampage", () => {
  it("ESD02-015 4.4.5.2: destroys every opponent battle card in the chosen zone and the zones adjacent to it", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    me.monsterPosition = 7;
    opp.monsterPosition = 1;
    for (const zone of [7, 4, 6, 8, 5, 2] as ZoneNumber[])
      place(state, opp, battleCard({ id: 962000 + zone }), zone);
    const mine = place(state, me, battleCard({ id: 962100 }), 8);
    const card = inHand(state, me, real("ESD02-015"));
    const paused = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: card.instanceId,
      strategyZone: 1,
    });
    expect(paused.pendingChoice).toMatchObject({ player: me.id, kind: "zone" });
    expect(paused.pendingChoice?.options).toHaveLength(8);
    const after = applyAction(paused, {
      type: "choose",
      player: me.id,
      choiceId: paused.pendingChoice?.id ?? 0,
      optionId: `${opp.id}:7`,
    });
    // Zone 7 is adjacent to 6 and 8 (numbers differ by 1) and to 4 (behind it).
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({
      "2": [962002],
      "5": [962005],
    });
    // Only the opponent's cards: my own zone 8 card is left alone.
    expect(turnPlayer(after).zones[8].map((s) => s[0]?.instanceId)).toEqual([
      mine.instanceId,
    ]);
  });
});

describe("gates (Q7, Q9) and the 10.8.1 layers in legality checks", () => {
  const numbers: string[] = [];
  const handlers: string[] = [];
  afterEach(() => {
    for (const n of numbers.splice(0)) setTestAbilities(n, null);
    for (const h of handlers.splice(0)) registerCustomEffect(h, null);
  });

  it("Q7 an Awakening gate that closes mid-resolution stops the remaining effects (10.3.2)", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    me.monsterPosition = 4;
    const source = battleCard();
    numbers.push(source.deckCardNumber);
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "retreat-then-draw",
          gates: [{ gate: "awakening", zone: 4 }],
          trigger: { on: "phaseBegins", phase: "main", whose: "yours" },
          effects: [
            { effect: "custom", handler: "test-retreat" },
            { effect: "draw", player: "you", count: 1 },
          ],
        },
      ],
    });
    handlers.push("test-retreat");
    registerCustomEffect("test-retreat", (s, ctx) => {
      const player = s.players.find((p) => p.id === ctx.master);
      if (player) player.monsterPosition = 3;
    });
    place(state, me, source, 2);
    const hand = me.hand.length;
    const after = runTo(state, "7.3.2");
    expect(logTypes(after)).toContain("abilityInactive");
    expect(turnPlayer(after).hand).toHaveLength(hand);
    expect(after.result).toBeNull();
  });

  it("Q9 a turn gate keeps a triggered ability from firing on the other player's turn", () => {
    const state = runTo(newGame(), "7.3.1");
    const opp = nonTurnPlayer(state);
    const source = battleCard();
    numbers.push(source.deckCardNumber);
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "draw-on-main",
          gates: [{ gate: "turn", whose: "yours" }],
          trigger: { on: "phaseBegins", phase: "main", whose: "either" },
          effects: [{ effect: "draw", player: "you", count: 1 }],
        },
      ],
    });
    place(state, opp, source, 2);
    expect(logTypes(runTo(state, "7.3.2"))).not.toContain("enterStandby");
  });

  it("8.2.1 and 8.3.1 read the rank through the 10.8.1 layers (a rank modifier)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    me.monsterPosition = 2;
    opp.monsterPosition = 2;
    const source = battleCard();
    numbers.push(source.deckCardNumber);
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "continuous",
          id: "cheaper",
          modifiers: [
            {
              stat: "rank",
              target: { owner: "you", area: "hand" },
              amount: -1,
            },
          ],
        },
      ],
    });
    const battle = inHand(state, me, battleCard({ rank: 3 }));
    const strategy = inHand(state, me, strategyCard({ rank: 3 }));
    const legal = (s: GameState) =>
      getLegalActions(s, me.id)
        .filter((a) => a.type === "playBattle" || a.type === "activateStrategy")
        .map((a) => ("cardInstanceId" in a ? a.cardInstanceId : ""));
    expect(legal(state)).not.toContain(battle.instanceId);
    expect(legal(state)).not.toContain(strategy.instanceId);
    place(state, me, source, 5);
    expect(legal(state)).toContain(battle.instanceId);
    expect(legal(state)).toContain(strategy.instanceId);
  });
});
