import { afterEach, describe, expect, it } from "vitest";
import {
  type AbilityDefinition,
  buildLoopReport,
  type GameRecord,
  getLegalActions,
  LOOP_STEP_LIMIT,
  registerAbility,
  replay,
  startGame,
  stateHash,
  unregisterAbility,
} from "../src";
import { testDeck } from "./fixtures/cards";

const RANK_ONE = 900001; // alice's rank I monster in the fixture decks

afterEach(() => {
  unregisterAbility("fixture-loop");
});

function record(): GameRecord {
  return {
    version: 1,
    seed: 4242,
    decks: [testDeck("alice", 0), testDeck("bob", 1)],
    actions: [],
  };
}

/**
 * A forced loop: when the main phase begins, and again every time it resolves, alice's monster
 * puts this ability back in standby. Nothing else changes, so the same state comes back.
 */
function registerForcedLoop(resolve: AbilityDefinition["resolve"] = () => {}) {
  registerAbility({
    abilityId: "fixture-loop",
    cardIds: [RANK_ONE],
    triggers: ({ event, master }) =>
      (event.type === "phaseBegins" &&
        event.payload["phase"] === "main" &&
        event.player === master) ||
      (event.type === "resolveAbility" &&
        event.payload["abilityId"] === "fixture-loop"),
    resolve,
  });
}

describe("infinite loops (13.1, Paul's ruling)", () => {
  it("13.1.1.3 a forced loop ends the game in a draw and produces a loop report (case 54)", () => {
    registerForcedLoop();
    const rec = record();
    const state = startGame(rec);
    expect(state.result).toEqual({
      winner: null,
      reason: "draw",
      rule: "13.1.1.3",
    });
    expect(state.loop).toMatchObject({
      kind: "repeatedState",
      step: "7.3.2",
      turn: 1,
    });
    expect(
      state.log.filter((e) => e.type === "resolveAbility").length,
    ).toBeGreaterThanOrEqual(2);
    expect(state.log.slice(-2).map((e) => e.type)).toEqual([
      "infiniteLoop",
      "gameOver",
    ]);
    expect(getLegalActions(state, "alice")).toEqual([]);

    const report = buildLoopReport(rec, state);
    expect(report).toMatchObject({
      kind: "gojisim-loop-report",
      version: 1,
      seed: 4242,
      actions: [],
      position: 0,
    });
    expect(report.decks).toEqual(rec.decks);
    expect(report.log).toEqual(state.log);
    expect(report.state).toEqual(state);
    // The report is a game record: after a JSON round trip it replays to the same loop.
    const loaded = JSON.parse(JSON.stringify(report)) as GameRecord;
    expect(stateHash(replay(loaded))).toBe(stateHash(state));
    expect(replay(loaded).loop).toEqual(state.loop);
  });

  it("13.1.1.3 a loop whose state never repeats still ends at the step limit", () => {
    registerForcedLoop((s) => {
      const alice = s.players.find((p) => p.id === "alice");
      if (alice) alice.rage += 1;
    });
    const state = startGame(record());
    expect(state.result).toMatchObject({ reason: "draw", rule: "13.1.1.3" });
    expect(state.loop?.kind).toBe("stepLimit");
    expect(state.players.find((p) => p.id === "alice")?.rage).toBeGreaterThan(
      LOOP_STEP_LIMIT / 2,
    );
  });

  it("13.1.1 without abilities, ordinary turns never look like a loop", () => {
    const state = startGame(record());
    expect(state.result).toBeNull();
    expect(state.loop).toBeNull();
  });

  it("13.1.1 the canonical hash ignores instance ids, counters and the log", () => {
    const state = startGame(record());
    const renamed = JSON.parse(JSON.stringify(state));
    renamed.players[0].hand[0].instanceId = "c999999";
    renamed.nextInstanceId += 50;
    renamed.log.push({ seq: 999, type: "note", player: null, payload: {} });
    expect(stateHash(renamed)).toBe(stateHash(state));
    renamed.players[0].rage += 1;
    expect(stateHash(renamed)).not.toBe(stateHash(state));
  });
});
