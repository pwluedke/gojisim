import { afterEach, describe, expect, it } from "vitest";
import {
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameState,
  getCounterPower,
  type PlayerState,
} from "../src";
import { setTestAbilities } from "../src/testing";
import {
  atPlayTiming,
  inHand,
  monster,
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
  turnPlayer,
} from "./fixtures/state";

const byId = (state: GameState, id: string) =>
  state.players.find((p) => p.id === id) as PlayerState;

/** Answers every pending choice with its first option. */
function resolveChoices(state: GameState): GameState {
  let current = state;
  while (current.pendingChoice) {
    const choice = current.pendingChoice;
    current = applyAction(current, {
      type: "choose",
      player: choice.player,
      choiceId: choice.id,
      optionId: choice.options[0]?.id ?? "",
    });
  }
  return current;
}

function choose(state: GameState, optionId: string): GameState {
  const choice = state.pendingChoice;
  if (!choice) throw new Error("No pending choice");
  return applyAction(state, {
    type: "choose",
    player: choice.player,
    choiceId: choice.id,
    optionId,
  });
}

/** Whether the log has a destroy of this card id (a `destroyed` event). */
const destroyedIds = (state: GameState) =>
  state.log
    .filter((e) => e.type === "destroy")
    .flatMap((e) => e.payload["cardIds"] as number[]);

describe("ESD01-011 Godzilla (2023): Q1 replacement on every destroy", () => {
  const id = () => real("ESD01-011").id;

  function expectBottom(state: GameState, owner: string) {
    const player = byId(state, owner);
    expect(player.deck.at(-1)?.cardId).toBe(id());
    expect(player.discard.map((c) => c.cardId)).not.toContain(id());
    expect(destroyedIds(state)).not.toContain(id());
    expect(logTypes(state)).toContain("replace");
  }

  it("ESD01-011 10.9.1: destroyed by an opponent's effect, it goes to the bottom of its deck instead", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    me.monsterPosition = 3; // Heat Ray: the opponent's zones 3 and 8
    place(state, opp, real("ESD01-011"), 8);
    const heatRay = inHand(state, me, real("ESD01-016"));
    const after = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: heatRay.instanceId,
      strategyZone: 1,
    });
    expect(zoneCardIds(byId(after, opp.id))).toEqual({});
    expectBottom(after, opp.id);
  });

  it("ESD01-011 11.3: crushed by its own monster advancing into its zone, it goes to the bottom of its deck instead", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 2;
    place(state, me, real("ESD01-011"), 3);
    const card = addCard(state, battleCard({ invadeZones: 1 }), me.id);
    me.hand.push(card);
    const after = applyAction(state, {
      type: "invade",
      player: me.id,
      cardInstanceId: card.instanceId,
    });
    expect(turnPlayer(after).monsterPosition).toBe(3);
    expect(zoneCardIds(turnPlayer(after))).toEqual({});
    expectBottom(after, me.id);
    expect(after.log.find((e) => e.type === "replace")?.payload).toMatchObject({
      replacedRule: "11.3",
    });
  });

  it("ESD01-011 11.5: replaced through an overload, it goes to the bottom of its deck and the new card stays", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    nonTurnPlayer(state).monsterPosition = 8;
    place(state, me, real("ESD01-011"), 4);
    const newer = inHand(state, me, battleCard({ id: 966001, rank: 1 }));
    const after = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: newer.instanceId,
      zone: 4,
    });
    expect(zoneCardIds(turnPlayer(after))).toEqual({ "4": [966001] });
    expectBottom(after, me.id);
  });

  it("ESD01-011 12.2: on enter with 2 or more rage, reduces the opponent's rage by 1", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    me.rage = 2;
    opp.rage = 2;
    opp.monsterPosition = 8;
    const card = inHand(state, me, real("ESD01-011"));
    const after = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone: 2,
    });
    expect(nonTurnPlayer(after).rage).toBe(1);
  });
});

describe("ESD01-012 Godzilla (2023)", () => {
  function playMonsterWith(position: number) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, monsterCard(2, { traits: ["Godzilla"] }), position as 1);
    const card = place(state, me, real("ESD01-012"), 2);
    place(state, me, battleCard(), 5);
    const next = inHand(state, me, monsterCard(2, { traits: ["Godzilla"] }));
    const after = applyAction(state, {
      type: "playMonster",
      player: me.id,
      cardInstanceId: next.instanceId,
    });
    return { after, card };
  }

  it("ESD01-012 Q5: when you play a monster card on your turn, it may move to an unoccupied zone, never its own monster's zone", () => {
    const { after: paused, card } = playMonsterWith(6);
    const me = paused.turnPlayer;
    expect(paused.pendingChoice).toMatchObject({ player: me, kind: "zone" });
    const offered = paused.pendingChoice?.options.map((o) => o.id);
    // Zones 1, 3, 4, 7, 8: not 2 (where it is), 5 (occupied) or 6 (the monster), plus "done".
    expect(offered).toEqual([
      ...[1, 3, 4, 7, 8].map((z) => `${me}:${z}`),
      "done",
    ]);
    const after = choose(paused, `${me}:8`);
    // Zone to zone: it keeps its instance id (4.1.4).
    expect(turnPlayer(after).zones[8].map((s) => s[0]?.instanceId)).toEqual([
      card.instanceId,
    ]);
  });

  it("ESD01-012 10.5.4: the move is optional", () => {
    const { after: paused, card } = playMonsterWith(6);
    const after = choose(paused, "done");
    expect(turnPlayer(after).zones[2].map((s) => s[0]?.instanceId)).toEqual([
      card.instanceId,
    ]);
  });

  it("ESD01-012 Q9: a monster played on the opponent's turn (after a counter) offers no move", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, opp, monsterCard(1, { traits: ["Godzilla"] }), 6);
    opp.rage = 0;
    opp.monsterDeck = [
      addCard(state, monsterCard(2, { traits: ["Godzilla"] }), opp.id),
    ];
    place(state, opp, real("ESD01-012"), 2);
    place(state, me, battleCard({ counterOrThreat: 50000 }), 4);
    const after = advanceToDecision(
      applyAction(state, { type: "pass", player: me.id }),
    );
    expect(after.pendingChoice).toBeNull();
    expect(after.log.some((e) => e.type === "newInvadingMonster")).toBe(true);
    expect(logTypes(after)).not.toContain("moveBattle");
  });

  it("ESD01-012 10.8.1: +3,000 counter power in zone 8", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const there = place(state, me, real("ESD01-012"), 8);
    const elsewhere = place(state, me, real("ESD01-012"), 7);
    expect(getCounterPower(state, there)).toBe(10000);
    expect(getCounterPower(state, elsewhere)).toBe(7000);
  });

  it("ESD01-012 Q1: destroyed, it goes to the bottom of its deck instead", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 2;
    place(state, me, real("ESD01-012"), 3);
    const card = addCard(state, battleCard({ invadeZones: 1 }), me.id);
    me.hand.push(card);
    const after = applyAction(state, {
      type: "invade",
      player: me.id,
      cardInstanceId: card.instanceId,
    });
    expect(turnPlayer(after).deck.at(-1)?.cardId).toBe(real("ESD01-012").id);
    expect(destroyedIds(after)).not.toContain(real("ESD01-012").id);
  });
});

describe("ESD01-013 Ginza Annihilated", () => {
  const numbers: string[] = [];
  afterEach(() => {
    for (const n of numbers.splice(0)) setTestAbilities(n, null);
  });

  /** A Ginza in a strategy zone of `owner`, and `count` rank 6 battle cards for the other player. */
  function withGinza(
    state: GameState,
    owner: PlayerState,
    count = 2,
    zone: 0 | 1 = 0,
  ) {
    const ginza = addCard(state, real("ESD01-013"), owner.id);
    owner.strategyZones[zone].push({ card: ginza, placedOnTurn: state.turn });
    const other = state.players.find((p) => p.id !== owner.id) as PlayerState;
    for (let i = 0; i < count; i++)
      if (other.zones[(i + 2) as 2].length === 0)
        place(state, other, battleCard({ rank: 6 }), (i + 2) as 2);
    return ginza;
  }

  /** A fixture battle card whose [enter] changes a player's rage by `delta`. */
  function rageCard(player: "you" | "opponent", delta: number) {
    const card = battleCard({ rank: 1 });
    numbers.push(card.deckCardNumber);
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "enter-rage",
          trigger: { on: "enter" },
          effects: [{ effect: "rage", player, delta }],
        },
      ],
    });
    return card;
  }

  const destroysBy = (state: GameState) =>
    state.log.filter(
      (e) =>
        e.type === "destroy" && e.payload["cause"] === "ESD01-013#rage-destroy",
    ).length;

  it("ESD01-013 10.1.1.1.2: does nothing on placement (Q10)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 4;
    place(state, nonTurnPlayer(state), battleCard({ rank: 6 }), 2);
    const card = inHand(state, me, real("ESD01-013"));
    const after = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: card.instanceId,
      strategyZone: 1,
    });
    expect(after.pendingChoice).toBeNull();
    expect(logTypes(after)).not.toContain("strategyTextPending");
    expect(logTypes(after)).not.toContain("enterStandby");
    expect(destroysBy(after)).toBe(0);
  });

  it("ESD01-013 8.4.1: the gain rage action triggers it once", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    withGinza(state, me, 1);
    const card = inHand(state, me, monsterCard(1));
    const after = applyAction(state, {
      type: "gainRage",
      player: me.id,
      cardInstanceId: card.instanceId,
    });
    expect(destroysBy(after)).toBe(1);
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({});
  });

  it("ESD01-013 8.5.1.1: playing a monster card triggers it once", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    withGinza(state, me, 1);
    monster(state, me, monsterCard(2, { traits: ["Godzilla"] }), 2);
    const card = inHand(state, me, monsterCard(2, { traits: ["Godzilla"] }));
    const after = applyAction(state, {
      type: "playMonster",
      player: me.id,
      cardInstanceId: card.instanceId,
    });
    expect(destroysBy(after)).toBe(1);
  });

  it("ESD01-013 3.4: an effect that raises your rage triggers it, once per change whatever the size", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    withGinza(state, me, 2);
    nonTurnPlayer(state).monsterPosition = 8;
    const card = inHand(state, me, rageCard("you", 2));
    const after = resolveChoices(
      applyAction(state, {
        type: "playBattle",
        player: me.id,
        cardInstanceId: card.instanceId,
        zone: 6,
      }),
    );
    expect(turnPlayer(after).rage).toBe(2);
    expect(destroysBy(after)).toBe(1);
  });

  it("ESD01-013 Q9: doesn't trigger on the opponent's turn", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    withGinza(state, opp, 1); // the opponent's Ginza; it's my turn
    opp.monsterPosition = 8;
    const card = inHand(state, me, rageCard("opponent", 1));
    const after = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone: 6,
    });
    expect(nonTurnPlayer(after).rage).toBe(1);
    expect(destroysBy(after)).toBe(0);
  });

  it("ESD01-013 10.6.2: doesn't trigger on the opponent's rage", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    withGinza(state, me, 1);
    nonTurnPlayer(state).monsterPosition = 8;
    const card = inHand(state, me, rageCard("opponent", 1));
    const after = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone: 6,
    });
    expect(destroysBy(after)).toBe(0);
  });

  it("ESD01-013 7.2.3: it is discarded at your next start phase", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const ginza: CardInstance = withGinza(state, me, 0);
    const pass = (s: GameState) =>
      advanceToDecision(applyAction(s, { type: "pass", player: s.turnPlayer }));
    const next = pass(pass(state));
    expect(next.turnPlayer).toBe(me.id);
    expect(
      next.log.some(
        (e) =>
          e.type === "discardStrategy" && e.payload["cardId"] === ginza.cardId,
      ),
    ).toBe(true);
    expect(byId(next, me.id).strategyZones.flat()).toEqual([]);
  });

  it("ESD01-013 10.6.2.1: two copies in both strategy zones each trigger: 2 destroys per rage increase", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    withGinza(state, me, 3, 0);
    withGinza(state, me, 0, 1);
    const card = inHand(state, me, monsterCard(1));
    const after = resolveChoices(
      applyAction(state, {
        type: "gainRage",
        player: me.id,
        cardInstanceId: card.instanceId,
      }),
    );
    expect(destroysBy(after)).toBe(2);
    expect(Object.keys(zoneCardIds(nonTurnPlayer(after)))).toHaveLength(1);
  });
});

describe("replacement order (10.9.2)", () => {
  afterEach(() => setTestAbilities("TEST-967001", null));

  it("10.9.2.1 with 2 replacements for one destroy, the card's master picks one, and only it applies (10.9.2.3)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    const card = battleCard({ id: 967001 });
    const instead = (id: string, where: "top" | "bottom") => ({
      kind: "replacement" as const,
      id,
      replaces: {
        event: "destroyed" as const,
        what: {
          owner: "you" as const,
          area: "zones" as const,
          this: true as const,
        },
      },
      instead: [
        {
          effect: "putOnDeck" as const,
          target: {
            owner: "you" as const,
            area: "zones" as const,
            this: true as const,
          },
          where,
        },
      ],
    });
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities: [instead("to-top", "top"), instead("to-bottom", "bottom")],
    });
    me.monsterPosition = 3;
    place(state, opp, card, 8);
    const heatRay = inHand(state, me, real("ESD01-016"));
    const paused = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: heatRay.instanceId,
      strategyZone: 1,
    });
    expect(paused.pendingChoice).toMatchObject({
      player: opp.id,
      kind: "replacementOrder",
      rule: "10.9.2.1",
    });
    const after = choose(paused, "TEST-967001#to-bottom");
    expect(byId(after, opp.id).deck.at(-1)?.cardId).toBe(967001);
    expect(byId(after, opp.id).deck[0]?.cardId).not.toBe(967001);
    expect(after.log.filter((e) => e.type === "replace")).toHaveLength(1);
  });
});
