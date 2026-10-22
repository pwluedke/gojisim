import { describe, expect, it } from "vitest";
import {
  type Action,
  applyAction,
  type GameState,
  getLegalActions,
  getPlayerView,
  type ManualOp,
} from "../src";
import { atPlayTiming, inHand, place, real } from "./fixtures/real";
import {
  addCard,
  battleCard,
  logTypes,
  newGame,
  nonTurnPlayer,
  runTo,
  turnPlayer,
} from "./fixtures/state";

const manual = (state: GameState, player: string, op: ManualOp) =>
  applyAction(state, { type: "manual", player, op });

const done = (state: GameState) =>
  applyAction(state, {
    type: "choose",
    player: state.pendingChoice?.player ?? "",
    choiceId: state.pendingChoice?.id ?? 0,
    optionId: "done",
  });

/** Plays EBP01-047 Orga ("[enter] Draw 1 card, then discard 1 card"), a card with no data. */
function playOrga() {
  const state = atPlayTiming();
  const me = turnPlayer(state);
  nonTurnPlayer(state).monsterPosition = 8;
  const orga = inHand(state, me, real("EBP01-047"));
  return applyAction(state, {
    type: "playBattle",
    player: me.id,
    cardInstanceId: orga.instanceId,
    zone: 2,
  });
}

describe("manual override (spec 'Manual override', format.md change 10)", () => {
  it("playing a manual card opens a manual window for its master; only `done` and concede are listed", () => {
    const state = playOrga();
    const me = state.turnPlayer;
    expect(state.pendingChoice).toMatchObject({
      player: me,
      kind: "manual",
      options: [{ id: "done", cardId: real("EBP01-047").id }],
    });
    expect(
      state.log.find((e) => e.type === "manualWindow")?.payload,
    ).toMatchObject({
      cardId: real("EBP01-047").id,
      reason: "played",
    });
    expect(getLegalActions(state, me).map((a) => a.type)).toEqual([
      "choose",
      "concede",
    ]);
    expect(
      getLegalActions(state, nonTurnPlayer(state).id).map((a) => a.type),
    ).toEqual(["concede"]);
    const after = done(state);
    expect(after.pendingChoice).toBeNull();
    expect(after.step).toBe("7.3.2");
    expect(logTypes(after)).toContain("manualDone");
  });

  it("both players may draw, discard, change rage, shuffle and move monsters; every action is logged with its cause and seen by both", () => {
    let state = playOrga();
    const me = state.turnPlayer;
    const opp = nonTurnPlayer(state).id;
    const hand = turnPlayer(state).hand.length;
    const discard = turnPlayer(state).discard.length;
    state = manual(state, me, { kind: "draw", player: me, count: 1 });
    const card = turnPlayer(state).hand[0]?.instanceId as string;
    state = manual(state, me, {
      kind: "move",
      instanceId: card,
      to: { area: "discard" },
    });
    state = manual(state, opp, { kind: "rage", player: opp, delta: 2 });
    state = manual(state, opp, { kind: "shuffle", player: opp });
    // The opponent's monster: zone 8 back to 7 and on to 8 again (both zones are empty).
    state = manual(state, me, { kind: "retreat", player: opp });
    state = manual(state, me, { kind: "advance", player: opp });
    expect(turnPlayer(state).hand).toHaveLength(hand);
    expect(turnPlayer(state).discard).toHaveLength(discard + 1);
    expect(nonTurnPlayer(state).rage).toBe(2);
    const entries = state.log.filter((e) => e.type === "manual");
    expect(entries.map((e) => [e.player, e.payload["kind"]])).toEqual([
      [me, "draw"],
      [me, "move"],
      [opp, "rage"],
      [opp, "shuffle"],
      [me, "retreat"],
      [me, "advance"],
    ]);
    expect(
      entries.every((e) => e.payload["cause"] === real("EBP01-047").id),
    ).toBe(true);
    // The log is public: the opponent sees every manual action.
    expect(
      getPlayerView(state, opp).log.filter((e) => e.type === "manual"),
    ).toHaveLength(6);
    // A card moved to the discard pile is named; one drawn is not.
    expect(entries[1]?.payload["cardId"]).toBeDefined();
    expect(entries[0]?.payload["cardId"]).toBeUndefined();
  });

  it("a revealed card is shown to both players until the window closes (5.10.1.1)", () => {
    const state = playOrga();
    const me = state.turnPlayer;
    const opp = nonTurnPlayer(state).id;
    const card = turnPlayer(state).hand[0]?.instanceId as string;
    const revealed = manual(state, me, { kind: "reveal", instanceId: card });
    expect(
      getPlayerView(revealed, opp).revealed.map((r) => r.card.instanceId),
    ).toEqual([card]);
    expect(getPlayerView(done(revealed), opp).revealed).toEqual([]);
  });

  it("manual actions are refused without a manual window, and with bad parameters", () => {
    const state = atPlayTiming();
    const me = state.turnPlayer;
    const action: Action = {
      type: "manual",
      player: me,
      op: { kind: "draw", player: me, count: 1 },
    };
    expect(() => applyAction(state, action)).toThrow(
      "no manual window is open",
    );
    const open = playOrga();
    expect(() =>
      manual(open, open.turnPlayer, {
        kind: "move",
        instanceId: "c999999",
        to: { area: "hand" },
      }),
    ).toThrow("no card");
    expect(() =>
      manual(open, open.turnPlayer, {
        kind: "draw",
        player: open.turnPlayer,
        count: 0,
      }),
    ).toThrow("bad draw");
  });

  it("activating a manual strategy card opens a window (and still logs strategyTextPending)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 8;
    const card = inHand(state, me, real("EBP01-032")); // Heat Ray Charge: "Draw 2 cards."
    const after = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: card.instanceId,
      strategyZone: 1,
    });
    expect(after.pendingChoice).toMatchObject({ kind: "manual" });
    expect(
      after.log.find((e) => e.type === "manualWindow")?.payload["reason"],
    ).toBe("strategy");
    expect(logTypes(after)).toContain("strategyTextPending");
  });

  it("a manual card whose text names the phase that begins opens a window then", () => {
    // EBP01-026 Jet Jaguar (2023): "At the beginning of your counter phase, you may place ..."
    const state = runTo(newGame(), "7.3.2");
    place(state, turnPlayer(state), real("EBP01-026"), 2);
    const passed = applyAction(state, {
      type: "pass",
      player: state.turnPlayer,
    });
    let current = passed;
    while (!current.pendingChoice) current = runTo(current, "7.4.2");
    expect(current.pendingChoice).toMatchObject({ kind: "manual" });
    expect(
      current.log.find((e) => e.type === "manualWindow")?.payload["reason"],
    ).toBe("phase counter");
  });

  it("abilities a manual action triggers resolve after the window closes (ESD01-013 on a manual rage +1)", () => {
    const state = playOrga();
    const me = turnPlayer(state);
    me.strategyZones[0].push({
      card: addCard(state, real("ESD01-013"), me.id),
      placedOnTurn: state.turn,
    });
    place(state, nonTurnPlayer(state), battleCard({ id: 970001, rank: 6 }), 3);
    const raised = manual(state, me.id, {
      kind: "rage",
      player: me.id,
      delta: 1,
    });
    expect(raised.standby.map((s) => s.abilityId)).toEqual([
      "ESD01-013#rage-destroy",
    ]);
    const after = done(raised);
    expect(nonTurnPlayer(after).zones[3]).toEqual([]);
  });

  it("implemented cards and cards with no text open no window", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    nonTurnPlayer(state).monsterPosition = 8;
    const vanilla = inHand(state, me, real("EBP01-016")); // Ebirah (2004): no text
    const starter = inHand(state, me, real("ESD02-011"));
    const a = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: vanilla.instanceId,
      zone: 2,
    });
    const b = applyAction(a, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: starter.instanceId,
      zone: 3,
    });
    expect(logTypes(b)).not.toContain("manualWindow");
    expect(b.pendingChoice).toBeNull();
  });
});
