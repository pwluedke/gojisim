import { describe, expect, it } from "vitest";
import {
  type Action,
  type GameState,
  getLegalActions,
  stateHash,
} from "@gojisim/engine";
import { deckOptions, type DeckOption } from "./decks";
import { newSession, type PlayerId, type Session, withAction } from "./session";
import {
  botTurnLabels,
  classroomSandbox,
  classroomStage,
  differenceName,
  sandboxEnd,
  withClassroomRating,
  withClassroomSubmit,
} from "./classroom";

const decks = () => {
  const [a, b] = deckOptions([]);
  if (!a || !b) throw new Error("no decks");
  return [a, b] as [DeckOption, DeckOption];
};

const BOT: PlayerId = "P2";

function classroomGame(seed = 365): Session {
  return newSession(
    seed,
    decks(),
    { P1: { kind: "human" }, P2: { kind: "bot", difficulty: 100 } },
    { classroom: true, firstPick: { player: "P1", card: 0 } },
  );
}

const decider = (state: GameState) =>
  (state.pendingChoice?.player ?? state.turnPlayer) as PlayerId;

/** A simple move: the first choice option, else a pass. */
function simple(state: GameState): Action {
  const who = decider(state);
  const legal = getLegalActions(state, who).filter((a) => a.type !== "concede");
  return (
    legal.find((a) => a.type === "choose") ??
    legal.find((a) => a.type === "pass") ??
    (legal[0] as Action)
  );
}

/** Plays simple moves until the Classroom stage is `kind` (the bot's turn waits there). */
function until(session: Session, kind: "play" | "compare"): Session {
  let s = session;
  for (let i = 0; i < 400; i++) {
    if (classroomStage(s)?.kind === kind) return s;
    const state = s.states[s.position] as GameState;
    if (state.result) break;
    s = withAction(s, simple(state));
  }
  throw new Error(`never reached ${kind}`);
}

const live = (s: Session) => s.states[s.position] as GameState;

describe("Kaiju Classroom (#365)", () => {
  it("7.3 the game waits at the start of the bot's main phase; a normal game never does", () => {
    const s = until(classroomGame(), "play");
    const stage = classroomStage(s);
    expect(stage).toMatchObject({ kind: "play", player: BOT });
    expect(live(s)).toMatchObject({ turnPlayer: BOT, phase: "main" });
    expect(s.record).toMatchObject({
      classroom: true,
      excludedFromAchievements: true,
    });
    const normal = newSession(
      365,
      decks(),
      { P1: { kind: "human" }, P2: { kind: "bot", difficulty: 100 } },
      { firstPick: { player: "P1", card: 0 } },
    );
    expect(normal.record.classroom).toBeUndefined();
    expect(normal.record.excludedFromAchievements).toBeUndefined();
    expect(classroomStage(normal)).toBeNull();
  });

  it("the sandbox turn never changes the real session; submitting adds information only", () => {
    const real = until(classroomGame(), "play");
    const before = JSON.stringify(real.record);
    const hashes = real.states.map(stateHash);
    let sandbox = classroomSandbox(real, BOT);
    // The player sits in the bot's seat; the bot answers for the player's own seat.
    expect(sandbox.seats).toEqual({
      P1: { kind: "bot", difficulty: 100 },
      P2: { kind: "human" },
    });
    const from = sandbox.position;
    const play = getLegalActions(live(sandbox), BOT).find(
      (a) => a.type === "playBattle",
    );
    if (play) sandbox = withAction(sandbox, play);
    expect(sandboxEnd(sandbox, from)).toBeNull();
    sandbox = withAction(sandbox, { type: "pass", player: BOT });
    expect(sandboxEnd(sandbox, from)).not.toBeNull();
    // The real game is as it was.
    expect(JSON.stringify(real.record)).toBe(before);
    expect(real.states.map(stateHash)).toEqual(hashes);
    const submitted = withClassroomSubmit(real, sandbox, from, BOT);
    expect(submitted.record.actions).toEqual(real.record.actions);
    expect(submitted.states).toBe(real.states);
    const [turn] = submitted.record.classroomTurns ?? [];
    expect(turn).toMatchObject({
      player: BOT,
      actionIndex: from,
      turn: live(real).turn,
    });
    expect(turn?.playerActions.at(-1)).toEqual({ type: "pass", player: BOT });
    expect(turn?.playerLabels).toHaveLength(turn?.playerActions.length ?? 0);
    expect(turn?.botVersion).toMatch(/^\d{4}-\d{2}-\d{2}/);
    // Submitted: the bot plays its own turn (no stage until its main phase ends).
    expect(classroomStage(submitted)).toBeNull();
  });

  it("10.4.4.3 the same pass in both turns: same end position, rated same automatically", () => {
    const real = until(classroomGame(), "play");
    const from = real.position;
    const sandbox = withAction(classroomSandbox(real, BOT), {
      type: "pass",
      player: BOT,
    });
    let s = withClassroomSubmit(real, sandbox, from, BOT);
    s = withAction(s, { type: "pass", player: BOT });
    const stage = classroomStage(s);
    if (stage?.kind !== "compare") throw new Error("no compare");
    expect(stage.same).toBe(true);
    expect(stage.botEnd.index).toBe(from);
    expect(botTurnLabels(s, stage)).toHaveLength(1);
    const rated = withClassroomRating(s, stage, "same");
    expect(rated.record.classroomTurns?.[0]).toMatchObject({
      same: true,
      rating: "same",
      botEndIndex: from,
    });
    expect(rated.record.actions).toEqual(s.record.actions);
    expect(classroomStage(rated)).toBeNull();
  });

  it("8 a main-phase play the bot didn't make: not same, with the differences, and the rating's why", () => {
    const real = until(classroomGame(), "play");
    const from = real.position;
    // A main-phase play the bot's pass doesn't make (a battle card, rage, an invasion…).
    const play = getLegalActions(live(real), BOT).find(
      (a) => a.type !== "pass" && a.type !== "concede" && a.type !== "choose",
    ) as Action;
    expect(play).toBeDefined();
    let sandbox = withAction(classroomSandbox(real, BOT), play);
    while (live(sandbox).pendingChoice)
      sandbox = withAction(sandbox, simple(live(sandbox)));
    sandbox = withAction(sandbox, { type: "pass", player: BOT });
    let s = withClassroomSubmit(real, sandbox, from, BOT);
    s = withAction(s, { type: "pass", player: BOT });
    const stage = classroomStage(s);
    if (stage?.kind !== "compare") throw new Error("no compare");
    expect(stage.same).toBe(false);
    expect(stage.differences.length).toBeGreaterThan(0);
    const rated = withClassroomRating(s, stage, "worse", "Play the card.");
    expect(rated.record.classroomTurns?.[0]).toMatchObject({
      same: false,
      rating: "worse",
      reason: "Play the card.",
    });
    expect(rated.record.classroomTurns?.[0]?.differences).toEqual(
      stage.differences,
    );
    // The next bot turn waits again.
    expect(classroomStage(until(rated, "play"))).toMatchObject({
      kind: "play",
    });
  });

  it("names differences in plain words", () => {
    expect(differenceName("own.zones.3")).toBe("Bot's zone 3");
    expect(differenceName("opponent.handCount")).toBe("Your hand size");
    expect(differenceName("own.hand")).toBe("Bot's hand");
  });
});
