import { describe, expect, it } from "vitest";
import {
  type Action,
  advance,
  applyAction,
  type CardInstance,
  type GameState,
  getLegalActions,
  type PlayerState,
  type ZoneNumber,
} from "../src";
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

/** A game at the turn player's main phase play timing, with an empty hand. */
function mainPhase(): { state: GameState; me: PlayerState; opp: PlayerState } {
  const state = runTo(newGame(), "7.3.2");
  const me = turnPlayer(state);
  me.hand = [];
  return { state, me, opp: nonTurnPlayer(state) };
}

function inHand(
  state: GameState,
  player: PlayerState,
  card: Parameters<typeof addCard>[1],
): CardInstance {
  const instance = addCard(state, card, player.id);
  player.hand.push(instance);
  return instance;
}

const legal = (state: GameState) => getLegalActions(state, state.turnPlayer);
const ofType = <T extends Action["type"]>(state: GameState, type: T) =>
  legal(state).filter(
    (a): a is Extract<Action, { type: T }> => a.type === type,
  );
const me = (state: GameState) => turnPlayer(state);

describe("play a battle card (8.2)", () => {
  it("8.2.1 opponent monster in zone 3: of battle cards rank 3 and 4, only rank 3 is legal (case 21)", () => {
    const { state, opp: o, me: m } = mainPhase();
    o.monsterPosition = 3;
    const rank3 = inHand(state, m, battleCard({ rank: 3 }));
    inHand(state, m, battleCard({ rank: 4 }));
    const plays = ofType(state, "playBattle");
    expect(new Set(plays.map((a) => a.cardInstanceId))).toEqual(
      new Set([rank3.instanceId]),
    );
  });

  it("10.5.2.1.2 own monster in zone 2: a battle card is legal in every zone except 2 (case 22)", () => {
    const { state, me: m, opp: o } = mainPhase();
    m.monsterPosition = 2;
    o.monsterPosition = 8;
    inHand(state, m, battleCard({ rank: 1 }));
    expect(ofType(state, "playBattle").map((a) => a.zone)).toEqual([
      1, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("11.5 a battle card played to an occupied zone destroys the old card; the new card stays (case 23)", () => {
    const { state, me: m } = mainPhase();
    const old = addCard(state, battleCard(), m.id);
    m.zones[5].push([old]);
    const card = inHand(state, m, battleCard({ rank: 1 }));
    const after = applyAction(state, {
      type: "playBattle",
      player: m.id,
      cardInstanceId: card.instanceId,
      zone: 5,
    });
    const zone = me(after).zones[5];
    expect(zone).toHaveLength(1);
    expect(zone[0]?.map((c) => c.cardId)).toEqual([card.cardId]);
    expect(me(after).discard.map((c) => c.cardId)).toEqual([old.cardId]);
    expect(after.log.find((e) => e.type === "destroy")?.payload["rule"]).toBe(
      "11.5",
    );
  });

  it("10.5.2 playing a card moves it to the resolution area, then to its zone, logging both moves", () => {
    const { state, me: m } = mainPhase();
    const card = inHand(state, m, battleCard({ rank: 1 }));
    const after = applyAction(state, {
      type: "playBattle",
      player: m.id,
      cardInstanceId: card.instanceId,
      zone: 4,
    });
    const moves = after.log
      .filter((e) => e.type === "play" || e.type === "place")
      .map((e) => [e.payload["from"], e.payload["to"]]);
    expect(moves).toEqual([
      ["hand", "resolutionArea"],
      ["resolutionArea", "zone 4"],
    ]);
    expect(after.resolutionArea).toEqual([]);
    expect(me(after).hand).toEqual([]);
    // 4.1.4: a new object in each new area.
    expect(me(after).zones[4][0]?.[0]?.instanceId).not.toBe(card.instanceId);
    expect(after).toMatchObject({ step: "7.3.2", phase: "main" });
  });
});

describe("activate a strategy card (8.3)", () => {
  it("8.3.1 own monster in zone 4: a rank 5 strategy card is not legal; rank 4 is (case 24)", () => {
    const { state, me: m } = mainPhase();
    m.monsterPosition = 4;
    inHand(state, m, strategyCard({ rank: 5 }));
    const rank4 = inHand(state, m, strategyCard({ rank: 4 }));
    expect(
      ofType(state, "activateStrategy").map((a) => [
        a.cardInstanceId,
        a.strategyZone,
      ]),
    ).toEqual([
      [rank4.instanceId, 1],
      [rank4.instanceId, 2],
    ]);
  });

  it("8.3.2 with both strategy zones filled there is no strategy action (case 25)", () => {
    const { state, me: m } = mainPhase();
    m.monsterPosition = 8;
    m.strategyZones = [
      [{ card: addCard(state, strategyCard(), m.id), placedOnTurn: 1 }],
      [{ card: addCard(state, strategyCard(), m.id), placedOnTurn: 1 }],
    ];
    inHand(state, m, strategyCard({ rank: 1 }));
    expect(ofType(state, "activateStrategy")).toEqual([]);
  });

  it("8.3.2 with one strategy zone filled only the empty one is offered", () => {
    const { state, me: m } = mainPhase();
    m.strategyZones[0] = [
      { card: addCard(state, strategyCard(), m.id), placedOnTurn: 1 },
    ];
    inHand(state, m, strategyCard({ rank: 1 }));
    expect(
      ofType(state, "activateStrategy").map((a) => a.strategyZone),
    ).toEqual([2]);
  });

  it("10.1.1.1.2 an activated strategy card is placed with this turn's number and logs strategyTextPending", () => {
    const { state, me: m } = mainPhase();
    const card = inHand(state, m, strategyCard({ rank: 1 }));
    const after = applyAction(state, {
      type: "activateStrategy",
      player: m.id,
      cardInstanceId: card.instanceId,
      strategyZone: 2,
    });
    expect(
      me(after).strategyZones[1].map((p) => [p.card.cardId, p.placedOnTurn]),
    ).toEqual([[card.cardId, after.turn]]);
    expect(logTypes(after)).toEqual(
      expect.arrayContaining(["play", "place", "strategyTextPending"]),
    );
  });
});

describe("gain rage (8.4)", () => {
  it("8.4.1 with 2 monster cards in hand the rage action is available twice; rage ends at 2 (case 26)", () => {
    const { state, me: m } = mainPhase();
    inHand(state, m, monsterCard(3));
    inHand(state, m, monsterCard(4));
    let current = state;
    for (let i = 0; i < 2; i++) {
      const [action] = ofType(current, "gainRage");
      expect(action).toBeDefined();
      current = applyAction(current, action as Action);
    }
    expect(ofType(current, "gainRage")).toEqual([]);
    expect(me(current).rage).toBe(2);
    expect(me(current).discard).toHaveLength(2);
  });
});

describe("play a monster card (8.5)", () => {
  it("8.5.1 a rank II monster card with no shared trait is not legal (case 27)", () => {
    const { state, me: m } = mainPhase();
    m.invadingMonsterZone.push(addCard(state, monsterCard(2), m.id));
    inHand(state, m, monsterCard(2, { traits: ["Other"] }));
    expect(ofType(state, "playMonster")).toEqual([]);
  });

  it("8.5.1 a monster card of a different rank is not legal even with a shared trait", () => {
    const { state, me: m } = mainPhase();
    inHand(state, m, monsterCard(2));
    expect(ofType(state, "playMonster")).toEqual([]);
  });

  it("8.5.1.1 a legal monster card is stacked on top, the position is unchanged and rage +1 (case 28)", () => {
    const { state, me: m } = mainPhase();
    m.monsterPosition = 4;
    m.rage = 1;
    const card = inHand(
      state,
      m,
      monsterCard(1, { traits: ["Other", "Testzilla"] }),
    );
    const [action] = ofType(state, "playMonster");
    const after = applyAction(state, action as Action);
    const stack = me(after).invadingMonsterZone;
    expect(stack).toHaveLength(2);
    expect(stack.at(-1)?.cardId).toBe(card.cardId);
    expect(me(after).monsterPosition).toBe(4);
    expect(me(after).rage).toBe(2);
    expect(after.turnFlags.monsterPlayed).toBe(true);
  });

  it("Ruling: monster once per turn: after playing a monster, a second legal monster is not offered (case 53)", () => {
    const { state, me: m } = mainPhase();
    inHand(state, m, monsterCard(1));
    inHand(state, m, monsterCard(1));
    expect(ofType(state, "playMonster")).toHaveLength(2);
    const after = applyAction(state, ofType(state, "playMonster")[0] as Action);
    expect(ofType(after, "playMonster")).toEqual([]);
    // Gaining rage with the other one is still allowed.
    expect(ofType(after, "gainRage")).toHaveLength(1);
  });

  it("M1d trait errata apply: traits are read through getCardTraits", () => {
    const { state, me: m } = mainPhase();
    // Rodan(2004) is printed "Rodan, Weapon" and corrected to "Rodan, Final Wars".
    m.invadingMonsterZone.push(
      addCard(
        state,
        monsterCard(1, {
          deckCardNumber: "EBP02-015",
          traits: ["Rodan", "Weapon"],
        }),
        m.id,
      ),
    );
    inHand(state, m, monsterCard(1, { traits: ["Weapon"] }));
    const finalWars = inHand(
      state,
      m,
      monsterCard(1, { traits: ["Final Wars"] }),
    );
    expect(ofType(state, "playMonster").map((a) => a.cardInstanceId)).toEqual([
      finalWars.instanceId,
    ]);
  });
});

describe("invade (8.6)", () => {
  function invadeWith(state: GameState, icon: number | null) {
    const m = me(state);
    const card = inHand(state, m, battleCard({ rank: 4, invadeZones: icon }));
    return applyAction(state, {
      type: "invade",
      player: m.id,
      cardInstanceId: card.instanceId,
    });
  }

  it("8.6.1 discarding a card with invasion icon 2 from zone 3 puts the monster in zone 5 (case 29)", () => {
    const { state, me: m } = mainPhase();
    m.monsterPosition = 3;
    const after = invadeWith(state, 2);
    expect(me(after).monsterPosition).toBe(5);
    expect(me(after).discard).toHaveLength(1);
    expect(
      after.log
        .filter((e) => e.type === "advance")
        .map((e) => [e.payload["from"], e.payload["to"]]),
    ).toEqual([
      [3, 4],
      [4, 5],
    ]);
  });

  it("8.6.2 with the invasion already used this turn there is no invade action (case 30)", () => {
    const { state, me: m } = mainPhase();
    inHand(state, m, battleCard());
    const after = invadeWith(state, 1);
    expect(ofType(after, "invade")).toEqual([]);
    expect(after.turnFlags.invasionUsed).toBe(true);
  });

  it("5.13.1.1.2 zone 8, opponent's zone 8 empty, invade with icon 1: the turn player wins by invasion (case 31)", () => {
    const { state, me: m } = mainPhase();
    m.monsterPosition = 8;
    const after = invadeWith(state, 1);
    expect(after.result).toEqual({
      winner: m.id,
      reason: "invasion",
      rule: "5.13.1.1.2",
    });
    expect(getLegalActions(after, m.id)).toEqual([]);
    expect(() => advance(after)).toThrow("game over");
  });

  it("5.13.1.1.1 zone 8, opponent's zone 8 holds a battle card, invade: no move and no win (case 32)", () => {
    const { state, me: m, opp: o } = mainPhase();
    m.monsterPosition = 8;
    o.zones[8].push([addCard(state, battleCard(), o.id)]);
    const after = invadeWith(state, 1);
    expect(me(after).monsterPosition).toBe(8);
    expect(after.result).toBeNull();
    expect(after.log.find((e) => e.type === "noAdvance")?.payload).toEqual({
      rule: "5.13.1.1.1",
      zone: 8,
    });
    expect(logTypes(after)).not.toContain("gameOver");
  });

  it("5.13.1.1.2 zone 7, invade with icon 2, opponent's zone 8 empty: advances to 8, then wins (case 33)", () => {
    const { state, me: m } = mainPhase();
    m.monsterPosition = 7;
    const after = invadeWith(state, 2);
    expect(me(after).monsterPosition).toBe(8);
    expect(after.result).toMatchObject({ winner: m.id, reason: "invasion" });
    // The game ends at once (1.2.1): no check timing after the action.
    expect(after.log.at(-1)?.type).toBe("invasionDone");
    expect(logTypes(after).slice(-3)).toEqual([
      "advance",
      "gameOver",
      "invasionDone",
    ]);
  });

  it("5.13.1.1.1 zone 7, icon 2, opponent's zone 8 holds a battle card: reaches 8, the second step fails, no win", () => {
    const { state, me: m, opp: o } = mainPhase();
    m.monsterPosition = 7;
    o.zones[8].push([addCard(state, battleCard(), o.id)]);
    const after = invadeWith(state, 2);
    expect(me(after).monsterPosition).toBe(8);
    expect(after.result).toBeNull();
    expect(
      after.log.find((e) => e.type === "invasionDone")?.payload,
    ).toMatchObject({ advances: 1, didAdvance: true });
    expect(logTypes(after)).toContain("noAdvance");
  });

  it("1.3.2.2 a card with no invasion icon still uses the invasion; the monster does not move", () => {
    for (const icon of [null, 0]) {
      const { state, me: m } = mainPhase();
      m.monsterPosition = 3;
      const after = invadeWith(state, icon);
      expect(me(after).monsterPosition).toBe(3);
      expect(after.turnFlags.invasionUsed).toBe(true);
      expect(
        after.log.find((e) => e.type === "invasionDone")?.payload,
      ).toMatchObject({ advances: 0, didAdvance: false });
    }
  });

  it("11.3 each invasion step that enters a zone with the player's own battle card destroys it", () => {
    const { state, me: m } = mainPhase();
    m.monsterPosition = 3;
    const four = addCard(state, battleCard(), m.id);
    const five = addCard(state, battleCard(), m.id);
    m.zones[4].push([four]);
    m.zones[5].push([five]);
    const after = invadeWith(state, 2);
    expect(me(after).zones[4]).toEqual([]);
    expect(me(after).zones[5]).toEqual([]);
    expect(
      after.log
        .filter((e) => e.type === "advance" || e.type === "destroy")
        .map((e) => e.type),
    ).toEqual(["advance", "destroy", "advance", "destroy"]);
  });
});

describe("legal action list", () => {
  it("8.1.1 every action instance is listed, then pass, then concede; the non-turn player can only concede", () => {
    const { state, me: m, opp: o } = mainPhase();
    o.monsterPosition = 1;
    const battle = inHand(state, m, battleCard({ rank: 1 }));
    const monster = inHand(state, m, monsterCard(3));
    const actions = legal(state);
    expect(actions.filter((a) => a.type === "playBattle")).toHaveLength(7);
    expect(
      actions
        .filter((a) => a.type === "invade")
        .map((a) => (a as { cardInstanceId: string }).cardInstanceId),
    ).toEqual([battle.instanceId, monster.instanceId]);
    expect(actions.filter((a) => a.type === "gainRage")).toHaveLength(1);
    expect(actions.slice(-2)).toEqual([
      { type: "pass", player: m.id },
      { type: "concede", player: m.id },
    ]);
    expect(getLegalActions(state, o.id)).toEqual([
      { type: "concede", player: o.id },
    ]);
  });

  it("Engine: applyAction rejects an action that is not in the legal list", () => {
    const { state, me: m } = mainPhase();
    const card = inHand(state, m, battleCard({ rank: 1 }));
    const zone = m.monsterPosition as ZoneNumber;
    expect(() =>
      applyAction(state, {
        type: "playBattle",
        player: m.id,
        cardInstanceId: card.instanceId,
        zone,
      }),
    ).toThrow(/Illegal action/);
    expect(() =>
      applyAction(state, {
        type: "gainRage",
        player: m.id,
        cardInstanceId: card.instanceId,
      }),
    ).toThrow(/Illegal action/);
  });

  it("10.4.4.1 a check timing runs after each action, before the play timing is given again", () => {
    const { state, me: m } = mainPhase();
    const card = inHand(state, m, monsterCard(3));
    const after = applyAction(state, {
      type: "gainRage",
      player: m.id,
      cardInstanceId: card.instanceId,
    });
    expect(after.log.at(-1)).toMatchObject({
      type: "checkTiming",
      payload: { rule: "10.4.4.1" },
    });
    expect(after.step).toBe("7.3.2");
  });
});
