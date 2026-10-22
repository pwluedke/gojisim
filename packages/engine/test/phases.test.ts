import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  advance,
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerState,
  STEPS,
} from "../src";
import {
  addCard,
  at,
  battleCard,
  logTypes,
  monsterCard,
  newGame,
  nonTurnPlayer,
  runTo,
  shrinkHand,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";

/** Replaces the active monster with a fresh rank-`rank` monster card. */
function setActiveRank(
  state: GameState,
  player: PlayerState,
  rank: number,
): void {
  player.invadingMonsterZone.push(addCard(state, monsterCard(rank), player.id));
}

const pass = (state: GameState) =>
  applyAction(state, { type: "pass", player: state.turnPlayer });

describe("engine step runner", () => {
  it("Engine: advance runs one step at a time in rule order through a whole turn", () => {
    let state = newGame();
    const seen: string[] = [state.step];
    for (let i = 0; i < STEPS.length; i++) {
      state = state.step === "7.3.2" ? pass(state) : advance(state);
      seen.push(state.step);
    }
    expect(seen).toEqual([...STEPS, "7.2.1"]);
  });

  it("7.3.2 advance stops at the main phase play timing and does nothing more", () => {
    const state = advanceToDecision(newGame());
    expect(state.step).toBe("7.3.2");
    expect(state.phase).toBe("main");
    expect(advance(state)).toBe(state);
  });

  it("Engine: advance does not change the state it is given", () => {
    const state = newGame();
    const before = JSON.stringify(state);
    advance(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('1.2.1 once the game has a result, advance and applyAction throw "game over" and there are no actions', () => {
    const state = {
      ...newGame(),
      result: { winner: "alice", reason: "concession" as const, rule: "1.2.3" },
    };
    expect(() => advance(state)).toThrow("game over");
    expect(() =>
      applyAction(state, { type: "pass", player: state.turnPlayer }),
    ).toThrow("game over");
    expect(getLegalActions(state, state.turnPlayer)).toEqual([]);
    expect(advanceToDecision(state)).toBe(state);
  });
});

describe("start phase (7.2)", () => {
  it("7.2.2 draws equal to opponent rank: opponent monster rank III, turn player draws 3 (case 11)", () => {
    const state = newGame();
    setActiveRank(state, nonTurnPlayer(state), 3);
    const before = turnPlayer(state).hand.length;
    const after = runTo(state, "7.2.3");
    expect(turnPlayer(after).hand.length).toBe(before + 3);
    expect(after.log.at(-1)).toMatchObject({
      type: "draw",
      payload: { rule: "7.2.2", count: 3 },
    });
  });

  it("7.2.2 on turn 1 the first player draws 1, because the opponent's monster is rank I", () => {
    const state = runTo(newGame(), "7.2.3");
    expect(turnPlayer(state).hand).toHaveLength(6);
  });

  it("7.2.3 a strategy card placed last turn is discarded at the start phase (case 12)", () => {
    const state = { ...newGame(), turn: 3 };
    const player = turnPlayer(state);
    const card = addCard(state, strategyCard(), player.id);
    player.strategyZones[0] = [{ card, placedOnTurn: 1 }];
    const after = runTo(at(state, "7.2.3"), "7.2.4");
    expect(turnPlayer(after).strategyZones).toEqual([[], []]);
    expect(turnPlayer(after).discard.map((c) => c.cardId)).toEqual([
      card.cardId,
    ]);
  });

  it("7.2.3 a strategy card placed this turn stays until its owner's next start phase (case 13)", () => {
    let state = runTo(newGame(), "7.3.2");
    const owner = turnPlayer(state);
    const card = addCard(state, strategyCard(), owner.id);
    owner.strategyZones[1] = [{ card, placedOnTurn: state.turn }];
    const ownerId = owner.id;
    const zoneOf = (s: GameState) =>
      s.players.find((p) => p.id === ownerId)?.strategyZones[1] ?? [];

    state = runTo(pass(state), "7.2.4"); // through the opponent's start phase
    expect(state.turnPlayer).not.toBe(ownerId);
    expect(zoneOf(state)).toHaveLength(1);

    state = runTo(runTo(state, "7.2.1"), "7.2.3"); // the owner's next turn, before 7.2.3
    expect(state.turnPlayer).toBe(ownerId);
    expect(zoneOf(state)).toHaveLength(1);
    state = advance(state);
    expect(zoneOf(state)).toEqual([]);
  });

  it("7.2.4 rage 2 at the start of its owner's turn is set to 0 (case 14)", () => {
    const state = newGame();
    turnPlayer(state).rage = 2;
    expect(turnPlayer(runTo(state, "7.2.5")).rage).toBe(0);
  });

  it("7.2.4 rage 2 at the start of the opponent's turn stays 2 (case 15)", () => {
    const state = newGame();
    nonTurnPlayer(state).rage = 2;
    const after = runTo(state, "7.3.2");
    expect(nonTurnPlayer(after).rage).toBe(2);
  });

  it("7.1.1 turn flags are reset at the start of each turn", () => {
    const state = newGame();
    state.turnFlags = { invasionUsed: true, monsterPlayed: true };
    expect(advance(state).turnFlags).toEqual({
      invasionUsed: false,
      monsterPlayed: false,
    });
  });
});

describe("main phase play timing (7.3.2, 10.4.4)", () => {
  it("10.4.4.3 the player passes: the main phase ends and the counter phase starts (case 34)", () => {
    const state = runTo(newGame(), "7.3.2");
    expect(getLegalActions(state, state.turnPlayer)).toContainEqual({
      type: "pass",
      player: state.turnPlayer,
    });
    const after = pass(state);
    expect(after).toMatchObject({ phase: "counter", step: "7.4.1" });
    expect(after.log.at(-1)).toMatchObject({
      type: "pass",
      player: state.turnPlayer,
      payload: { rule: "10.4.4.3" },
    });
    expect(
      advance(after).log.find(
        (e) => e.type === "phaseBegins" && e.payload["phase"] === "counter",
      ),
    ).toBeDefined();
  });

  it("10.4.4.2 only the turn player gets a play timing; the non-turn player can only concede", () => {
    const state = runTo(newGame(), "7.3.2");
    const other = nonTurnPlayer(state).id;
    expect(getLegalActions(state, other)).toEqual([
      { type: "concede", player: other },
    ]);
    expect(() => applyAction(state, { type: "pass", player: other })).toThrow(
      /Illegal action/,
    );
  });
});

describe("end phase (7.5)", () => {
  it("7.5.2 a monster in zone 7 advances to 8 (case 16)", () => {
    const state = at(newGame(), "7.5.2");
    turnPlayer(state).monsterPosition = 7;
    expect(turnPlayer(advance(state)).monsterPosition).toBe(8);
  });

  it("7.5.2 a monster in zone 8 stays in 8, and nobody wins (case 17)", () => {
    const state = at(newGame(), "7.5.2");
    turnPlayer(state).monsterPosition = 8;
    const after = runTo(state, "7.2.1");
    expect(
      after.players.find((p) => p.id === state.turnPlayer)?.monsterPosition,
    ).toBe(8);
    expect(after.result).toBeNull();
  });

  it("7.5.4 a hand of 2 draws 3 (case 18)", () => {
    const state = at(newGame(), "7.5.4");
    shrinkHand(turnPlayer(state), 2);
    const after = advance(state);
    expect(turnPlayer(after).hand).toHaveLength(5);
    expect(after.log.at(-1)).toMatchObject({
      type: "draw",
      payload: { rule: "7.5.4", count: 3 },
    });
  });

  it("7.5.4 a hand of 7 draws 0 and discards nothing (case 19)", () => {
    const state = at(newGame(), "7.5.4");
    const player = turnPlayer(state);
    player.hand.push(player.deck.shift()!, player.deck.shift()!);
    const after = advance(state);
    expect(turnPlayer(after).hand).toHaveLength(7);
    expect(turnPlayer(after).discard).toEqual([]);
  });

  it("7.5.6 an until-end-of-turn effect is gone at the next turn; a permanent one stays (case 20)", () => {
    const state = runTo(newGame(), "7.3.2");
    state.continuousEffects = [
      { effectId: "fixture-eot", timestamp: 1, duration: "untilEndOfTurn" },
      { effectId: "fixture-permanent", timestamp: 2, duration: "permanent" },
    ];
    const atEnd = runTo(pass(state), "7.5.6");
    expect(atEnd.continuousEffects).toHaveLength(2);
    const nextTurn = runTo(atEnd, "7.2.1");
    expect(nextTurn.continuousEffects.map((e) => e.effectId)).toEqual([
      "fixture-permanent",
    ]);
  });

  it("7.5.7 with nothing pending the turn ends and the opponent becomes turn player", () => {
    const state = runTo(newGame(), "7.5.7");
    const after = advance(state);
    expect(after).toMatchObject({
      turn: 2,
      phase: "start",
      step: "7.2.1",
      turnPlayer: nonTurnPlayer(state).id,
    });
    expect(after.log.at(-1)).toMatchObject({
      type: "endTurn",
      payload: { rule: "7.5.7", turn: 1 },
    });
  });

  it("7.5.7 if a rule action is still pending, the end phase goes back to 7.5.4", () => {
    const state = runTo(newGame(), "7.5.7");
    const player = turnPlayer(state);
    player.zones[6].push([addCard(state, strategyCard(), player.id)]);
    expect(advance(state)).toMatchObject({ step: "7.5.4", turn: 1 });
  });
});

describe("rule actions (11)", () => {
  it("11.2 draw 3 with 1 card in deck and 5 in the discard pile: draws 1, reshuffles, draws 2 (case 47)", () => {
    const state = newGame();
    const player = turnPlayer(state);
    player.discard = player.deck.splice(0, 5);
    player.deck = player.deck.slice(0, 1);
    setActiveRank(state, nonTurnPlayer(state), 3);
    const before = player.hand.length;
    const after = runTo(state, "7.2.3");
    const p = turnPlayer(after);
    expect(p.hand.length).toBe(before + 3);
    expect(p.deck).toHaveLength(3);
    expect(p.discard).toEqual([]);
    expect(logTypes(after)).toContain("reshuffle");
    const reshuffleAt = after.log.findIndex((e) => e.type === "reshuffle");
    const drawAt = after.log.findIndex(
      (e) => e.type === "draw" && e.payload["rule"] === "7.2.2",
    );
    expect(reshuffleAt).toBeLessThan(drawAt);
  });

  it("11.2.4 a draw from an empty deck with an empty discard pile draws nothing, without an error (case 48)", () => {
    const state = newGame();
    const player = turnPlayer(state);
    player.deck = [];
    player.discard = [];
    const before = player.hand.length;
    const after = runTo(state, "7.2.3");
    expect(turnPlayer(after).hand).toHaveLength(before);
    expect(after.log.at(-1)).toMatchObject({
      type: "draw",
      payload: { count: 0 },
    });
  });

  it("11.3 the monster advancing into its own battle card's zone destroys that card immediately (case 49)", () => {
    const state = at(newGame(), "7.5.2");
    const player = turnPlayer(state);
    player.monsterPosition = 3;
    const card = addCard(state, battleCard(), player.id);
    player.zones[4].push([card]);
    const after = advance(state); // only 7.5.2: no check timing has run yet
    expect(after.step).toBe("7.5.3");
    expect(turnPlayer(after).monsterPosition).toBe(4);
    expect(turnPlayer(after).zones[4]).toEqual([]);
    expect(turnPlayer(after).discard.map((c) => c.cardId)).toEqual([
      card.cardId,
    ]);
    const last = after.log.slice(-2).map((e) => [e.type, e.payload["rule"]]);
    expect(last).toEqual([
      ["advance", "7.5.2"],
      ["destroy", "11.3"],
    ]);
  });

  it("11.3 the opponent's battle card in the same-numbered zone is not crushed", () => {
    const state = at(newGame(), "7.5.2");
    turnPlayer(state).monsterPosition = 3;
    const opponent = nonTurnPlayer(state);
    opponent.zones[4].push([addCard(state, battleCard(), opponent.id)]);
    expect(nonTurnPlayer(advance(state)).zones[4]).toHaveLength(1);
  });

  it("11.5 a zone with two battle cards keeps the last placed and destroys the other at check timing", () => {
    const state = newGame();
    const player = turnPlayer(state);
    const older = addCard(state, battleCard(), player.id);
    const newer = addCard(state, battleCard(), player.id);
    player.zones[5].push([older], [newer]);
    const after = advance(state); // 7.2.1 runs a check timing
    expect(turnPlayer(after).zones[5]).toEqual([[newer]]);
    expect(turnPlayer(after).discard.map((c) => c.cardId)).toEqual([
      older.cardId,
    ]);
  });

  it("11.5 a strategy zone with two strategy cards keeps the last placed", () => {
    const state = newGame();
    const player = turnPlayer(state);
    const older = addCard(state, strategyCard(), player.id);
    const newer = addCard(state, strategyCard(), player.id);
    player.strategyZones[0] = [
      { card: older, placedOnTurn: 1 },
      { card: newer, placedOnTurn: 1 },
    ];
    const after = advance(state);
    expect(turnPlayer(after).strategyZones[0].map((p) => p.card)).toEqual([
      newer,
    ]);
  });

  it("11.4.1 a strategy card in a zone and a battle card in a strategy zone go to the discard pile", () => {
    const state = newGame();
    const player = turnPlayer(state);
    const strategy = addCard(state, strategyCard(), player.id);
    const battle = addCard(state, battleCard(), player.id);
    player.zones[2].push([strategy]);
    player.strategyZones[1] = [{ card: battle, placedOnTurn: 1 }];
    const after = advance(state);
    expect(turnPlayer(after).zones[2]).toEqual([]);
    expect(turnPlayer(after).strategyZones[1]).toEqual([]);
    expect(
      turnPlayer(after)
        .discard.map((c) => c.cardId)
        .sort(),
    ).toEqual([battle.cardId, strategy.cardId].sort());
  });

  it("11.4.1 a monster card in a zone that is not part of an invading monster goes to the discard pile", () => {
    const state = newGame();
    const player = nonTurnPlayer(state);
    player.zones[6].push([addCard(state, monsterCard(3), player.id)]);
    expect(nonTurnPlayer(advance(state)).zones[6]).toEqual([]);
  });

  it("11.4.1.1 a card left in the resolution area goes to its owner's discard pile", () => {
    const state = newGame();
    const owner = nonTurnPlayer(state);
    const card = addCard(state, battleCard(), owner.id);
    state.resolutionArea = [card];
    const after = advance(state);
    expect(after.resolutionArea).toEqual([]);
    expect(nonTurnPlayer(after).discard.map((c) => c.cardId)).toEqual([
      card.cardId,
    ]);
  });

  it("10.4.3.1 check timing repeats until no rule action is left", () => {
    const state = newGame();
    const player = turnPlayer(state);
    // A strategy card on top of two battle cards: 11.4 removes it, which then leaves the zone
    // overloaded (11.5), resolved in the next pass of the same check timing.
    const a = addCard(state, battleCard(), player.id);
    const b = addCard(state, battleCard(), player.id);
    const s = addCard(state, strategyCard(), player.id);
    player.zones[7].push([a], [b, s]);
    const after = advance(state);
    expect(turnPlayer(after).zones[7]).toEqual([[b]]);
  });
});

describe("full turns", () => {
  it("Engine: 10 full turns of pass-only play from a fixed seed always end in the same state", () => {
    const play = () => {
      let state = newGame(20261021);
      while (state.turn <= 10)
        state = state.step === "7.3.2" ? pass(state) : advance(state);
      return state;
    };
    const hash = (state: GameState) =>
      createHash("sha256").update(JSON.stringify(state)).digest("hex");
    const first = play();
    expect(first).toMatchObject({ turn: 11, step: "7.2.1", result: null });
    expect(hash(play())).toBe(hash(first));
    // Golden hash: changes only when engine behavior or the state shape changes on purpose.
    // M3d added pendingChoice, checkTiming, pendingLosses and nextChoiceId; with those removed
    // the state still hashes to the M3b/M3c value 208bb050...4924d (behavior unchanged).
    // M3e added loopGuard and loop; with those removed it hashes to the M3d value 128a23c3...cfcf90.
    expect(hash(first)).toMatchInlineSnapshot(
      `"a5d594d28ce9f00006cdd6167aaaec4cb75e5d2ae61e91f0ed71858f62df1669"`,
    );
    // Each player had 5 turns, so each monster advanced from zone 1 to zone 6 (7.5.2).
    expect(first.players.map((p) => p.monsterPosition)).toEqual([6, 6]);
  });
});
