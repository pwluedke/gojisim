import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type Action,
  deckLegalityFor,
  advanceToDecision,
  applyAction,
  type GameRecord,
  type GameState,
  getLegalActions,
  replay,
  replayAll,
  startGame,
} from "../src";
import { testDeck } from "./fixtures/cards";

const hash = (state: GameState) =>
  createHash("sha256").update(JSON.stringify(state)).digest("hex");

/** Plays a game live, choosing actions with a simple deterministic policy, and records it. */
function playLive(
  seed: number,
  maxActions: number,
): { record: GameRecord; live: GameState } {
  const record: GameRecord = {
    version: 1,
    seed,
    decks: [testDeck("alice", 0), testDeck("bob", 1)],
    actions: [],
  };
  let state = startGame(record);
  for (let i = 0; i < maxActions && state.result === null; i++) {
    const chooser = state.pendingChoice?.player ?? state.turnPlayer;
    const options = getLegalActions(state, chooser).filter(
      (a) => a.type !== "concede",
    );
    // Rotate through the options so games use every action type, then pass.
    const action = options[(i * 7) % options.length] as Action;
    record.actions.push(action);
    state = advanceToDecision(applyAction(state, action));
  }
  return { record, live: state };
}

describe("game records", () => {
  it("Engine: replaying a record gives the same final state hash as the live game", () => {
    const { record, live } = playLive(20261021, 120);
    expect(record.actions.length).toBeGreaterThan(20);
    expect(hash(replay(record))).toBe(hash(live));
  });

  it("Engine: the record survives JSON export and import", () => {
    const { record, live } = playLive(7, 60);
    const imported = JSON.parse(JSON.stringify(record)) as GameRecord;
    expect(hash(replay(imported))).toBe(hash(live));
  });

  it("Engine: replay up to an index matches the states along the way", () => {
    const { record } = playLive(99, 40);
    const states = replayAll(record);
    expect(states).toHaveLength(record.actions.length + 1);
    for (const i of [0, 1, 10, record.actions.length]) {
      expect(hash(replay(record, i))).toBe(hash(states[i] as GameState));
    }
  });

  it("Engine: a new game is advanced to its first decision (the first main phase play timing)", () => {
    const state = startGame({
      seed: 1,
      decks: [testDeck("alice", 0), testDeck("bob", 1)],
    });
    expect(state).toMatchObject({ turn: 1, step: "7.3.2", phase: "main" });
  });
});

describe("deck legality in the record (Paul's ruling, Oct 21, 2026)", () => {
  it("6.3.1.1 each player's deck legality and failed rules are recorded; illegal decks still play", () => {
    const decks: GameRecord["decks"] = [
      testDeck("alice", 0),
      testDeck("bob", 1),
    ];
    const legality = deckLegalityFor(decks, new Date("2026-10-21T00:00:00Z"));
    // The fixture decks are legal: unique Red cards, ranks I to IV, 50 in the main deck.
    expect(legality.map((l) => [l.player, l.legal, l.failedRules])).toEqual([
      ["alice", true, []],
      ["bob", true, []],
    ]);
    expect(legality[0]).toMatchObject({ asOf: "2026-10-21" });
    const illegal = { ...decks[0], mainDeck: decks[0].mainDeck.slice(0, 40) };
    const [checked] = deckLegalityFor(
      [illegal],
      new Date("2026-10-21T00:00:00Z"),
    );
    expect(checked).toEqual({
      player: "alice",
      legal: false,
      failedRules: ["6.1.1.2"],
      asOf: "2026-10-21",
    });
    // The game itself starts regardless.
    const state = startGame({ seed: 1, decks: [illegal, decks[1]] });
    expect(state.result).toBeNull();
  });
});
