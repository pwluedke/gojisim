import { describe, expect, it } from "vitest";
import {
  advance,
  applyAction,
  type CardInstance,
  type GameState,
  getLegalActions,
  getPlayerView,
  getThreat,
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
  turnPlayer,
} from "./fixtures/state";

interface CounterSetup {
  /** Counter power of the turn player's battle cards, one card per entry. */
  powers?: number[];
  /** Rank of the opponent's active monster, taken from their monster deck (1 = the starting one). */
  opponentRank?: 1 | 2 | 3 | 4;
  opponentZone?: ZoneNumber;
  opponentRage?: number;
  /** Replaces the opponent's active monster threat (adds a custom rank-1 monster on top). */
  opponentThreat?: number;
}

/** A game just before 7.4.2, set up for a counter check. */
function counterGame(setup: CounterSetup): {
  state: GameState;
  me: PlayerState;
  opp: PlayerState;
} {
  const state = runTo(newGame(), "7.4.2");
  const me = turnPlayer(state);
  const opp = nonTurnPlayer(state);
  (setup.powers ?? []).forEach((power, i) => {
    me.zones[(i + 3) as ZoneNumber].push([
      addCard(state, battleCard({ counterOrThreat: power }), me.id),
    ]);
  });
  for (let rank = 2; rank <= (setup.opponentRank ?? 1); rank++) {
    const index = opp.monsterDeck.findIndex(
      (c) => state.cards[c.cardId]?.rank === rank,
    );
    opp.invadingMonsterZone.push(...opp.monsterDeck.splice(index, 1));
  }
  if (setup.opponentThreat !== undefined) {
    opp.invadingMonsterZone.push(
      addCard(
        state,
        monsterCard(1, { counterOrThreat: setup.opponentThreat }),
        opp.id,
      ),
    );
  }
  opp.monsterPosition = setup.opponentZone ?? 3;
  opp.rage = setup.opponentRage ?? 0;
  return { state, me, opp };
}

/** Runs 7.4.2 and 7.4.3. */
const runCounter = (state: GameState) => advance(advance(state));
const check = (state: GameState) =>
  state.log.find((e) => e.type === "counterCheck")?.payload;
const activeRank = (state: GameState, player: PlayerState) => {
  const top = player.invadingMonsterZone.at(-1) as CardInstance;
  return state.cards[top.cardId]?.rank;
};

describe("counter (5.15, 7.4)", () => {
  it("7.4.3 counter power 10,000 against threat 10,000 counters (a tie counts) (case 35)", () => {
    const { state } = counterGame({
      powers: [6000, 4000],
      opponentThreat: 10000,
    });
    const after = runCounter(state);
    expect(check(after)).toEqual({
      rule: "7.4.3",
      total: 10000,
      threat: 10000,
      countered: true,
    });
    expect(logTypes(after)).toContain("counter");
    expect(activeRank(after, nonTurnPlayer(after))).toBe(2);
  });

  it("7.4.3 counter power 9,000 against threat 10,000 does not counter (case 36)", () => {
    const { state, opp } = counterGame({
      powers: [9000],
      opponentThreat: 10000,
    });
    const after = runCounter(state);
    expect(check(after)).toMatchObject({
      total: 9000,
      threat: 10000,
      countered: false,
    });
    expect(nonTurnPlayer(after).invadingMonsterZone).toEqual(
      opp.invadingMonsterZone,
    );
    expect(logTypes(after)).not.toContain("counter");
  });

  it("3.4.5 threat 6,000 with rage 1 is 11,000, so counter power 10,000 does not counter (case 37)", () => {
    const { state, opp } = counterGame({ powers: [10000], opponentRage: 1 });
    expect(getThreat(state, opp.id)).toBe(11000);
    expect(check(runCounter(state))).toMatchObject({
      total: 10000,
      threat: 11000,
      countered: false,
    });
  });

  it("7.4.2.1 a monster card stacked in a zone adds nothing to the total (case 38)", () => {
    const { state, me } = counterGame({});
    const under = addCard(
      state,
      monsterCard(2, { counterOrThreat: 9000 }),
      me.id,
    );
    const top = addCard(state, battleCard({ counterOrThreat: 2000 }), me.id);
    me.zones[4].push([under, top]);
    expect(advance(state).counterTotal).toBe(2000);
  });

  it("5.16.1 a battle card that cannot engage is left out of the total (case 39)", () => {
    const { state, me } = counterGame({
      powers: [6000, 4000],
      opponentThreat: 10000,
    });
    const stack = me.zones[4][0] as CardInstance[];
    (stack[0] as CardInstance).statuses = ["cannotEngage"];
    const after = runCounter(state);
    expect(check(after)).toMatchObject({ total: 6000, countered: false });
  });

  it("5.15.1.1 a monster countered in zone 6, 7 or 8 moves behind to 5, 4 or 3 (case 40)", () => {
    for (const [from, to] of [
      [6, 5],
      [7, 4],
      [8, 3],
    ] as const) {
      const { state } = counterGame({ powers: [6000], opponentZone: from });
      const after = runCounter(state);
      expect(nonTurnPlayer(after).monsterPosition).toBe(to);
      expect(after.log.find((e) => e.type === "moveBehind")?.payload).toEqual({
        rule: "5.15.1.1",
        from,
        to,
      });
      // Moving behind is not a retreat (5.13.2) or an advance.
      expect(logTypes(after)).not.toContain("retreat");
      expect(logTypes(after)).not.toContain("advance");
    }
  });

  it("5.15.1.1 a monster countered in zone 4 stays in 4 (case 41)", () => {
    const { state } = counterGame({ powers: [6000], opponentZone: 4 });
    const after = runCounter(state);
    expect(nonTurnPlayer(after).monsterPosition).toBe(4);
    expect(logTypes(after)).not.toContain("moveBehind");
  });

  it("5.15.1.2 a countered rank II monster gets the rank III monster with a shared trait on top (case 42)", () => {
    const { state } = counterGame({
      powers: [7000],
      opponentRank: 2,
      opponentZone: 5,
    });
    const after = runCounter(state);
    const opp = nonTurnPlayer(after);
    expect(
      opp.invadingMonsterZone.map((c) => after.cards[c.cardId]?.rank),
    ).toEqual([1, 2, 3]);
    expect(opp.monsterPosition).toBe(5);
    expect(opp.monsterDeck.map((c) => after.cards[c.cardId]?.rank)).toEqual([
      4,
    ]);
    expect(after.pendingChoice).toBeNull();
  });

  it("5.15.1.2.1 countering a rank IV monster makes its master lose: victory through countering (case 43)", () => {
    const { state, me, opp } = counterGame({ powers: [9000], opponentRank: 4 });
    const after = runCounter(state);
    expect(after.result).toEqual({
      winner: me.id,
      reason: "victoryThroughCountering",
      rule: "5.15.1.2.1",
    });
    expect(after.log.at(-1)).toMatchObject({
      type: "gameOver",
      payload: { winner: me.id },
    });
    expect(after.log.find((e) => e.type === "loss")?.player).toBe(opp.id);
    expect(() => advance(after)).toThrow("game over");
  });

  it("5.15.1.2.1 a countered rank II monster whose rank III shares no trait: its master loses (case 44)", () => {
    const { state, me, opp } = counterGame({ powers: [7000], opponentRank: 2 });
    const rank3 = opp.monsterDeck.find(
      (c) => state.cards[c.cardId]?.rank === 3,
    ) as CardInstance;
    const other = monsterCard(3, { traits: ["Other"] });
    state.cards[other.id] = other;
    rank3.cardId = other.id;
    expect(runCounter(state).result).toMatchObject({
      winner: me.id,
      reason: "victoryThroughCountering",
    });
  });

  it("5.15.1.2 with two legal rank II monsters, a counter on rank I stops with a choice for the non-turn player", () => {
    const { state, me, opp } = counterGame({ powers: [6000] });
    const second = addCard(state, monsterCard(2), opp.id);
    opp.monsterDeck.push(second);
    const paused = runCounter(state);
    expect(paused.step).toBe("7.4.4");
    expect(paused.pendingChoice).toMatchObject({
      player: opp.id,
      kind: "nextMonster",
      rule: "5.15.1.2",
    });
    expect(paused.pendingChoice?.options).toHaveLength(2);
    // The engine waits: advance changes nothing, and only the chooser has choices.
    expect(advance(paused)).toBe(paused);
    const choices = getLegalActions(paused, opp.id);
    expect(choices.filter((a) => a.type === "choose")).toHaveLength(2);
    expect(choices.at(-1)).toEqual({ type: "concede", player: opp.id });
    expect(getLegalActions(paused, me.id)).toEqual([
      { type: "concede", player: me.id },
    ]);
    // 4.6.2: the options are cards from a hidden monster deck; the opponent sees only the count.
    expect(getPlayerView(paused, me.id).pendingChoice).toMatchObject({
      optionCount: 2,
      options: null,
    });
    expect(getPlayerView(paused, opp.id).pendingChoice?.options).toHaveLength(
      2,
    );
    expect(
      getPlayerView(paused, "spectator").pendingChoice?.options,
    ).toBeNull();

    const chosen = applyAction(paused, {
      type: "choose",
      player: opp.id,
      choiceId: paused.pendingChoice?.id as number,
      optionId: second.instanceId,
    });
    expect(chosen.pendingChoice).toBeNull();
    expect(nonTurnPlayer(chosen).invadingMonsterZone.at(-1)?.cardId).toBe(
      second.cardId,
    );
    expect(advance(chosen).step).toBe("7.5.1");
  });

  it("Engine: a choose action with a stale choice id is rejected", () => {
    const { state, opp } = counterGame({ powers: [6000] });
    opp.monsterDeck.push(addCard(state, monsterCard(2), opp.id));
    const paused = runCounter(state);
    const option = paused.pendingChoice?.options[0]?.id as string;
    expect(() =>
      applyAction(paused, {
        type: "choose",
        player: opp.id,
        choiceId: 999,
        optionId: option,
      }),
    ).toThrow(/Illegal action/);
  });

  it("5.15.1.2 the next monster keeps the counter's zone and the master's rage", () => {
    const { state } = counterGame({
      powers: [7000],
      opponentZone: 7,
      opponentRage: 0,
    });
    nonTurnPlayer(state).rage = 0;
    const after = runCounter(state);
    expect(nonTurnPlayer(after).monsterPosition).toBe(4);
    expect(nonTurnPlayer(after).rage).toBe(0);
  });
});
