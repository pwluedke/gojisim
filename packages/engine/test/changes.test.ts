import { describe, expect, it } from "vitest";
import {
  applyAction,
  cardChanges,
  type GameState,
  type PlayerState,
  startGame,
} from "../src";
import { setTestAbilities } from "../src/testing";
import { atPlayTiming, inHand, monster, place, real } from "./fixtures/real";
import { testGameOptions } from "./fixtures/cards";
import { battleCard, nonTurnPlayer, turnPlayer } from "./fixtures/state";

const playMonster = (state: GameState, card: { instanceId: string }) =>
  applyAction(state, {
    type: "playMonster",
    player: state.turnPlayer,
    cardInstanceId: card.instanceId,
  });

const top = (player: PlayerState) =>
  player.invadingMonsterZone.at(-1) as { instanceId: string };

const kinds = (state: GameState, instanceId: string) =>
  cardChanges(state, instanceId).map((c) => c.label);

describe("cardChanges (M5d change badge)", () => {
  it("12.5.2: a Burst play shows its rank change and the end-phase discard", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, real("ESD01-002"), 2); // rank II
    const after = playMonster(state, inHand(state, me, real("ESD01-006")));
    expect(cardChanges(after, top(turnPlayer(after)).instanceId)).toEqual([
      {
        kind: "burst",
        label: "Burst R2→R3 · discard at end phase",
        detail: "Burst R2→R3 · discard at end phase (12.5.2)",
      },
    ]);
  });

  it("10.8.1: a counter power modifier (ESD01-012's +3,000 in zone 8)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const card = place(state, me, real("ESD01-012"), 8);
    expect(cardChanges(state, card.instanceId)).toEqual([
      {
        kind: "counterPower",
        label: "CP +3000",
        detail: "Counter power +3000 from continuous effects (10.8.1)",
      },
    ]);
    const elsewhere = place(state, me, real("ESD01-012"), 6);
    expect(cardChanges(state, elsewhere.instanceId)).toEqual([]);
  });

  it("10.8.1: a rank modifier (test fixture ability) and a threat modifier (ESD01-003 with 2 rage)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const source = battleCard({ id: 970001 });
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "continuous",
          id: "bigger",
          modifiers: [
            {
              stat: "rank",
              target: { owner: "you", area: "monster" },
              amount: 1,
            },
          ],
        },
      ],
    });
    try {
      place(state, me, source, 5);
      const godzilla = monster(state, me, real("ESD01-003"), 3);
      me.rage = 2;
      expect(kinds(state, godzilla.instanceId)).toEqual([
        "Rank +1",
        "Threat +5000",
      ]);
    } finally {
      setTestAbilities(source.deckCardNumber, null);
    }
  });

  it("5.16.1: a card that cannot engage, and 5.17: a card played through Evolution", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const card = place(state, me, battleCard({ id: 970002 }), 4);
    card.statuses = ["cannotEngage"];
    card.playedVia = "evolution";
    expect(cardChanges(state, card.instanceId)).toEqual([
      {
        kind: "cannotEngage",
        label: "Can't engage",
        detail: "Cannot engage: adds no counter power (5.16.1)",
      },
      {
        kind: "playedVia",
        label: "Evolved",
        detail: "Played through Evolution (5.17)",
      },
    ]);
  });

  it("a card with no changes, or one not found, has none", () => {
    const state = atPlayTiming();
    const card = place(state, turnPlayer(state), battleCard(), 4);
    expect(cardChanges(state, card.instanceId)).toEqual([]);
    expect(cardChanges(state, "c99999")).toEqual([]);
  });
});

describe("confirmSingleTarget (M5d): 10.5.3.1's automatic pick becomes a choice for human seats", () => {
  /** ESD01-006 Burst 2 [enter]: destroy 1 rank 4 or lower; the opponent has exactly one. */
  function burstWithOneTarget(confirm: (me: string, opp: string) => string[]) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    const confirming = confirm(me.id, opp.id);
    if (confirming.length) state.confirmSingleTarget = confirming;
    monster(state, me, real("ESD01-002"), 2);
    const target = place(state, opp, battleCard({ id: 970004, rank: 4 }), 4);
    place(state, opp, battleCard({ id: 970005, rank: 5 }), 5);
    const after = playMonster(state, inHand(state, me, real("ESD01-006")));
    return { after, target };
  }

  it("10.5.3.1: with the option on, a single legal target is a one-option choice; confirming it destroys the card", () => {
    const { after, target } = burstWithOneTarget((me) => [me]);
    const choice = after.pendingChoice;
    expect(choice).toMatchObject({
      kind: "target",
      rule: "10.5.3",
      player: after.turnPlayer,
    });
    expect(choice?.options.map((o) => o.id)).toEqual([target.instanceId]);
    const done = applyAction(after, {
      type: "choose",
      player: after.turnPlayer,
      choiceId: choice?.id ?? 0,
      optionId: target.instanceId,
    });
    expect(done.pendingChoice).toBeNull();
    expect(nonTurnPlayer(done).zones[4]).toEqual([]);
    expect(nonTurnPlayer(done).zones[5]).toHaveLength(1);
  });

  it("10.5.3.1: a seat without the option (a bot) still gets the automatic pick", () => {
    for (const confirm of [() => [], (_: string, opp: string) => [opp]]) {
      const { after } = burstWithOneTarget(confirm);
      expect(after.pendingChoice).toBeNull();
      expect(nonTurnPlayer(after).zones[4]).toEqual([]);
    }
  });

  it("a game record carries the option into the new game; without it the state has none", () => {
    const { players } = testGameOptions();
    const record = { seed: 7, decks: players };
    expect(startGame(record).confirmSingleTarget).toBeUndefined();
    expect(
      startGame({ ...record, confirmSingleTarget: ["P1"] }).confirmSingleTarget,
    ).toEqual(["P1"]);
  });
});
