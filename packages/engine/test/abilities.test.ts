import { afterEach, describe, expect, it } from "vitest";
import {
  advance,
  applyAction,
  type GameState,
  getLegalActions,
  isAtPlayTiming,
} from "../src";
import {
  type AbilityDefinition,
  registerAbility,
  unregisterAbility,
} from "../src/testing";
import { markLoss } from "../src/losses";
import {
  addCard,
  battleCard,
  logTypes,
  newGame,
  nonTurnPlayer,
  runTo,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";

const registered: string[] = [];
function fixtureAbility(definition: AbilityDefinition): void {
  registerAbility(definition);
  registered.push(definition.abilityId);
}
afterEach(() => {
  for (const id of registered.splice(0)) unregisterAbility(id);
});

/** An ability that triggers when the main phase begins. */
function onMainPhase(
  abilityId: string,
  cardId: number,
  resolve: AbilityDefinition["resolve"],
): void {
  fixtureAbility({
    abilityId,
    cardIds: [cardId],
    triggers: ({ event }) =>
      event.type === "phaseBegins" && event.payload["phase"] === "main",
    resolve,
  });
}

const resolvedOrder = (state: GameState) =>
  state.log
    .filter((e) => e.type === "resolveAbility")
    .map((e) => e.payload["abilityId"]);

describe("automatic abilities (10.6) and check timing (10.4.3)", () => {
  it("10.6.2.1 a trigger that fires twice puts the ability in standby twice, and it resolves twice (case 51)", () => {
    const state = runTo(newGame(), "7.3.2");
    const me = turnPlayer(state);
    const source = battleCard();
    me.zones[6].push([addCard(state, source, me.id)]);
    fixtureAbility({
      abilityId: "fixture-rage-on-advance",
      cardIds: [source.id],
      triggers: ({ event, master }) =>
        event.type === "advance" && event.player === master,
      resolve: (s, ability) => {
        const player = s.players.find((p) => p.id === ability.master);
        if (player) player.rage += 1;
      },
    });
    const invader = addCard(state, battleCard({ invadeZones: 2 }), me.id);
    me.hand.push(invader);
    const after = applyAction(state, {
      type: "invade",
      player: me.id,
      cardInstanceId: invader.instanceId,
    });
    expect(logTypes(after).filter((t) => t === "enterStandby")).toHaveLength(2);
    expect(resolvedOrder(after)).toEqual([
      "fixture-rage-on-advance",
      "fixture-rage-on-advance",
    ]);
    expect(turnPlayer(after).rage).toBe(2);
    expect(after.standby).toEqual([]);
  });

  it("10.4.3 with abilities in standby for both players, the turn player's resolve first, one at a time, with rule actions between each (case 50)", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    const [a, b, c] = [battleCard(), battleCard(), battleCard()];
    me.zones[4].push([addCard(state, a, me.id)]);
    me.zones[5].push([addCard(state, b, me.id)]);
    opp.zones[5].push([addCard(state, c, opp.id)]);
    // A leaves an illegal card behind (a strategy card in a zone) for 11.4 to clean up.
    onMainPhase("fixture-A", a.id, (s) => {
      const player = turnPlayer(s);
      player.zones[7].push([addCard(s, strategyCard(), player.id)]);
    });
    onMainPhase("fixture-B", b.id, () => {});
    onMainPhase("fixture-C", c.id, () => {});

    const paused = advance(state); // 7.3.1: the trigger fires, then the check timing
    expect(paused.standby.map((x) => x.abilityId)).toEqual([
      "fixture-A",
      "fixture-B",
      "fixture-C",
    ]);
    expect(paused.pendingChoice).toMatchObject({
      player: me.id,
      kind: "standbyOrder",
      rule: "10.4.3.2",
    });
    expect(paused.pendingChoice?.options.map((o) => o.abilityId)).toEqual([
      "fixture-A",
      "fixture-B",
    ]);
    expect(isAtPlayTiming(paused)).toBe(false);

    const optionA = paused.pendingChoice?.options[0]?.id as string;
    const after = applyAction(paused, {
      type: "choose",
      player: me.id,
      choiceId: paused.pendingChoice?.id as number,
      optionId: optionA,
    });
    expect(resolvedOrder(after)).toEqual([
      "fixture-A",
      "fixture-B",
      "fixture-C",
    ]);
    const order = after.log
      .filter((e) => e.type === "resolveAbility" || e.type === "illegalCard")
      .map((e) => e.payload["abilityId"] ?? e.type);
    expect(order).toEqual([
      "fixture-A",
      "illegalCard",
      "fixture-B",
      "fixture-C",
    ]);
    expect(
      after.log.filter((e) => e.type === "resolveAbility").map((e) => e.player),
    ).toEqual([me.id, me.id, opp.id]);
    expect(after.standby).toEqual([]);
    expect(after.checkTiming).toBeNull();
    expect(isAtPlayTiming(after)).toBe(true);
  });

  it("10.6.2 a standby entry is plain JSON naming the ability, its card, its master and a timestamp", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const card = battleCard();
    const instance = addCard(state, card, me.id);
    me.zones[3].push([instance]);
    onMainPhase("fixture-json", card.id, () => {});
    onMainPhase("fixture-json-2", card.id, () => {});
    const paused = advance(state);
    expect(paused.standby[0]).toMatchObject({
      abilityId: "fixture-json",
      sourceInstanceId: instance.instanceId,
      sourceCardId: card.id,
      master: me.id,
    });
    expect(typeof paused.standby[0]?.timestamp).toBe("number");
    expect(JSON.parse(JSON.stringify(paused))).toEqual(paused);
  });

  it("10.3.4 a card stacked under another card has no active abilities", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const card = battleCard();
    me.zones[3].push([
      addCard(state, card, me.id),
      addCard(state, battleCard(), me.id),
    ]);
    onMainPhase("fixture-buried", card.id, () => {});
    expect(advance(state).standby).toEqual([]);
  });

  it("10.6.3.2 an ability in standby that cannot be played leaves standby", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    state.standby.push({
      standbyId: "s-orphan",
      abilityId: "not-registered",
      sourceInstanceId: "c0",
      sourceCardId: 0,
      master: me.id,
      timestamp: 0,
      event: state.log[0] as GameState["log"][number],
    });
    const after = advance(state);
    expect(after.standby).toEqual([]);
    expect(logTypes(after)).toContain("abilityNotPlayed");
  });
});

describe("win, loss and concede (1.2)", () => {
  it("1.2.3 a concession during the opponent's turn: the conceding player loses and no check timing runs (case 45)", () => {
    const state = runTo(newGame(), "7.3.2");
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    expect(getLegalActions(state, opp.id)).toEqual([
      { type: "concede", player: opp.id },
    ]);
    const after = applyAction(state, { type: "concede", player: opp.id });
    expect(after.result).toEqual({
      winner: me.id,
      reason: "concession",
      rule: "1.2.3",
    });
    const conceded = after.log.findIndex((e) => e.type === "loss");
    expect(after.log.slice(conceded).map((e) => e.type)).toEqual([
      "loss",
      "gameOver",
    ]);
    expect(getLegalActions(after, me.id)).toEqual([]);
  });

  it("1.2.3 the non-turn player can concede during the opponent's main phase, even while a choice is pending for the opponent", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    const [a, b] = [battleCard(), battleCard()];
    me.zones[4].push([addCard(state, a, me.id)]);
    me.zones[5].push([addCard(state, b, me.id)]);
    onMainPhase("fixture-A", a.id, () => {});
    onMainPhase("fixture-B", b.id, () => {});
    const paused = advance(state);
    expect(paused.pendingChoice?.player).toBe(me.id);
    const after = applyAction(paused, { type: "concede", player: opp.id });
    expect(after.result).toMatchObject({ winner: me.id, reason: "concession" });
    expect(after.pendingChoice).toBeNull();
  });

  it("1.2.3 a player can concede outside any play timing, e.g. during the start phase", () => {
    const state = advance(newGame());
    expect(state.step).toBe("7.2.2");
    const after = applyAction(state, {
      type: "concede",
      player: state.turnPlayer,
    });
    expect(after.result).toMatchObject({
      winner: nonTurnPlayer(state).id,
      reason: "concession",
    });
  });

  it("1.2.2 both players losing at the same time is a draw (case 46)", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const card = battleCard();
    me.zones[4].push([addCard(state, card, me.id)]);
    onMainPhase("fixture-both-lose", card.id, (s) => {
      for (const player of s.players) markLoss(s, player.id, "effect", "1.2.4");
    });
    const after = advance(state);
    expect(after.result).toEqual({
      winner: null,
      reason: "draw",
      rule: "1.2.2",
    });
    expect(after.log.filter((e) => e.type === "loss")).toHaveLength(2);
    expect(after.log.at(-1)).toMatchObject({
      type: "gameOver",
      payload: { winner: null, reason: "draw" },
    });
  });

  it("1.2.4 one player losing to an effect ends the game at once with the opponent as winner", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const card = battleCard();
    me.zones[4].push([addCard(state, card, me.id)]);
    onMainPhase("fixture-lose", card.id, (s, ability) =>
      markLoss(s, ability.master, "effect", "1.2.4"),
    );
    const after = advance(state);
    expect(after.result).toEqual({
      winner: nonTurnPlayer(state).id,
      reason: "effect",
      rule: "1.2.4",
    });
  });
});
