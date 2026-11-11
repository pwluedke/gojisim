import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import {
  type Action,
  type GameRecord,
  type GameState,
  getLegalActions,
  replayAll,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { resolveDeck } from "./decks.js";
import { firstPicker } from "./firstPick.js";
import {
  ABANDON_AFTER_MS,
  act,
  actionFor,
  actionsFor,
  answerUndo,
  askUndo,
  CLAIM_AFTER_MS,
  canAskUndo,
  canCancel,
  claimWin,
  concede,
  createRoom,
  historyBoard,
  joinRoom,
  KEEP_FINISHED_MS,
  phaseOf,
  pickCards,
  pickFirst,
  type Room,
  roomFromData,
  type SeatPlayer,
  seatMessage,
  setConnected,
  stepsFor,
  sweepVerdict,
  abandon,
} from "./room.js";

const GAME_ID = "0f8b6c3e-4b7a-4c1e-9d2a-5e6f7a8b9c0d";

function starter(set: "ESD01" | "ESD02"): SeatPlayer["deck"] {
  const found = resolveDeck(
    null as unknown as DatabaseSync,
    "nobody",
    { source: "official", set },
    "tournament",
    new Date("2026-11-10"),
  );
  if (!found.ok) throw new Error(found.error);
  return found.deck;
}

const alice: SeatPlayer = {
  playerId: "alice",
  name: "Alice",
  deckName: "Alice's deck",
  deck: starter("ESD01"),
};
const bob: SeatPlayer = {
  playerId: "bob",
  name: "Bob",
  deckName: "Bob's deck",
  deck: starter("ESD02"),
};

function newRoom(mode: "casual" | "tournament" = "casual", picker = "P2") {
  const room = createRoom({
    gameId: GAME_ID,
    seed: 42,
    mode,
    creator: alice,
    now: 0,
  });
  joinRoom(room, bob, () => picker as "P1" | "P2");
  setConnected(room, "P1", true, 0);
  setConnected(room, "P2", true, 0);
  return room;
}

const state = (room: Room) => room.states[room.states.length - 1] as GameState;
const seq = (room: Room) => room.data.record?.actions.length ?? 0;

/** Whoever must act: the pending choice's player, else the turn player. */
function decider(room: Room): "P1" | "P2" {
  const s = state(room);
  return (s.pendingChoice?.player ?? s.turnPlayer) as "P1" | "P2";
}

/** The decider's first legal action that isn't a concede. */
function firstMove(room: Room): Action {
  const seat = decider(room);
  const move = getLegalActions(state(room), seat).find(
    (a) => a.type !== "concede",
  );
  if (!move) throw new Error("no move");
  return move;
}

/** Plays until `seat` has an undoable action of its own as the last action. */
function playUntilUndoable(room: Room, seat: "P1" | "P2"): void {
  for (let i = 0; i < 400; i++) {
    if (canAskUndo(room, seat)) return;
    expect(act(room, decider(room), seq(room), firstMove(room), i).ok).toBe(
      true,
    );
  }
  throw new Error("never undoable");
}

describe("head to head rooms (M9a)", () => {
  it("waits for the second player, then the picker makes the First / Second pick (6.3.1.4)", () => {
    const room = createRoom({
      gameId: GAME_ID,
      seed: 42,
      mode: "casual",
      creator: alice,
      now: 0,
    });
    expect(phaseOf(room)).toBe("waiting");
    // The creator can't take the other seat too.
    joinRoom(room, alice);
    expect(phaseOf(room)).toBe("waiting");
    joinRoom(room, bob, () => "P2");
    expect(phaseOf(room)).toBe("picking");
    expect(joinRoom(room, { ...bob, playerId: "carol" })).toEqual({
      ok: false,
      error: "full",
    });
    expect(pickFirst(room, "P1", 0)).toEqual({
      ok: false,
      error: "not-your-pick",
    });
    expect(pickFirst(room, "P2", 1)).toEqual({ ok: true });
    expect(phaseOf(room)).toBe("playing");
    expect(room.data.record?.firstPick).toEqual({ player: "P2", card: 1 });
  });

  it("the server picks the picker at random, in one function", () => {
    expect(firstPicker(() => 0)).toBe("P1");
    expect(firstPicker(() => 1)).toBe("P2");
    const seen = new Set(Array.from({ length: 40 }, () => firstPicker()));
    expect(seen).toEqual(new Set(["P1", "P2"]));
  });

  it("the record is a head to head record: both humans with their player ids, no bot seed", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    const record = room.data.record;
    expect(record?.h2h).toBe(true);
    expect(record?.seats).toEqual({
      P1: { kind: "human", playerId: "alice", playerName: "Alice" },
      P2: { kind: "human", playerId: "bob", playerName: "Bob" },
    });
    expect(record?.botSeed).toBeUndefined();
    expect(record?.mode).toBe("casual");
    expect(record?.deckNames).toEqual({ P1: "Alice's deck", P2: "Bob's deck" });
  });

  it("each seat's message holds only that seat's view: the other hand and both deck orders never appear", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    const s = state(room);
    for (const seat of ["P1", "P2"] as const) {
      const text = JSON.stringify(seatMessage(room, seat, 0));
      const other = s.players.find((p) => p.id !== seat);
      for (const card of other?.hand ?? [])
        expect(text).not.toContain(`"${card.instanceId}"`);
      for (const player of s.players)
        for (const card of player.deck)
          expect(text).not.toContain(`"${card.instanceId}"`);
      expect(text).not.toContain("rngState");
      expect(text).not.toContain(`"seed"`);
    }
  });

  it("only legal actions of the seat's own are taken, and a stale or doubled move is refused", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    const seat = decider(room);
    const other = seat === "P1" ? "P2" : "P1";
    const move = firstMove(room);
    expect(act(room, other, seq(room), move, 0)).toEqual({
      ok: false,
      error: "illegal",
    });
    expect(
      act(
        room,
        seat,
        seq(room),
        { type: "playBattle", player: seat, instanceId: "x", zone: 1 },
        0,
      ),
    ).toEqual({ ok: false, error: "illegal" });
    const before = seq(room);
    expect(act(room, seat, before, move, 0)).toEqual({ ok: true });
    expect(act(room, seat, before, move, 0)).toEqual({
      ok: false,
      error: "stale",
    });
    expect(seq(room)).toBe(before + 1);
  });

  it("a concede ends the game for the other player (1.2.3), and the record replays to it", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    expect(concede(room, "P1", 5).ok).toBe(true);
    expect(phaseOf(room)).toBe("over");
    expect(room.data.record?.outcome?.winner).toBe("P2");
    const record = room.data.record;
    if (!record) throw new Error("no record");
    expect(replayAll(record).at(-1)?.result?.winner).toBe("P2");
    // The opponent's deck name shows once the game is over.
    expect(seatMessage(room, "P1", 5).opponent?.deckName).toBe("Bob's deck");
  });

  it("the opponent's deck reads as Mystery deck (null) while the game goes on (Q42)", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    expect(seatMessage(room, "P1", 0).opponent).toMatchObject({
      name: "Bob",
      deckName: null,
    });
  });

  it("plays a whole game to a rules result, every move checked", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    for (let i = 0; i < 4000 && phaseOf(room) === "playing"; i++)
      expect(act(room, decider(room), seq(room), firstMove(room), i).ok).toBe(
        true,
      );
    expect(phaseOf(room)).toBe("over");
    expect(room.data.record?.outcome?.reason).not.toBe("concede");
  });

  it("Casual undo needs the other player's yes; a no keeps the move", () => {
    const room = newRoom("casual");
    pickFirst(room, room.data.picker ?? "P1", 0);
    playUntilUndoable(room, "P1");
    const before = seq(room);
    expect(askUndo(room, "P1").ok).toBe(true);
    expect(seatMessage(room, "P2", 0).undo.asked).toBe("P1");
    // The asker can't answer their own request.
    expect(answerUndo(room, "P1", true, 0).ok).toBe(false);
    expect(answerUndo(room, "P2", false, 0).ok).toBe(true);
    expect(seq(room)).toBe(before);
    expect(askUndo(room, "P1").ok).toBe(true);
    expect(answerUndo(room, "P2", true, 9).ok).toBe(true);
    expect(seq(room)).toBe(before - 1);
    expect(room.data.record?.undoCount).toEqual({ P1: 1 });
    expect(room.states).toHaveLength(seq(room) + 1);
  });

  it("a move answers an open undo request with no", () => {
    const room = newRoom("casual");
    pickFirst(room, room.data.picker ?? "P1", 0);
    playUntilUndoable(room, "P1");
    askUndo(room, "P1");
    act(room, decider(room), seq(room), firstMove(room), 0);
    expect(room.data.undoAsk).toBeNull();
  });

  it("Tournament games have no undo", () => {
    const room = newRoom("tournament");
    pickFirst(room, room.data.picker ?? "P1", 0);
    for (let i = 0; i < 30; i++)
      act(room, decider(room), seq(room), firstMove(room), i);
    expect(canAskUndo(room, "P1")).toBe(false);
    expect(canAskUndo(room, "P2")).toBe(false);
    expect(askUndo(room, "P1")).toEqual({ ok: false, error: "no-undo" });
  });

  it("a confirmed multi-card pick (discarding down, 5.7.2) is one move and one undo", () => {
    // The web's fixture where P1 discards down to hand size during the other player's turn.
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          "../../../web/e2e/fixtures/discard-bot-turn.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as GameRecord & { position?: number };
    const record: GameRecord = {
      ...fixture,
      actions: fixture.actions.slice(
        0,
        fixture.position ?? fixture.actions.length,
      ),
      mode: "casual",
    };
    const room = roomFromData(
      {
        version: 1,
        gameId: GAME_ID,
        createdAt: 0,
        mode: "casual",
        seed: Number(record.seed),
        seats: { P1: alice, P2: bob },
        picker: "P1",
        record,
        batches: [],
        undoAsk: null,
        endedAt: null,
      },
      0,
    );
    const choice = state(room).pendingChoice;
    expect(choice?.player).toBe("P1");
    const ids = (choice?.options ?? [])
      .map((o) => o.id)
      .filter((id) => id !== "done")
      .slice(0, 2);
    expect(ids).toHaveLength(2);
    const before = seq(room);
    expect(pickCards(room, "P1", before, ids, false, 0).ok).toBe(true);
    expect(seq(room)).toBe(before + 2);
    expect(room.data.batches).toEqual([{ start: before, end: before + 2 }]);
    expect(askUndo(room, "P1").ok).toBe(true);
    expect(answerUndo(room, "P2", true, 0).ok).toBe(true);
    expect(seq(room)).toBe(before);
    expect(room.data.batches).toEqual([]);
  });

  it("a multi-card pick must start with a pick the engine offers", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    expect(
      pickCards(room, decider(room), seq(room), ["nope"], false, 0),
    ).toEqual({ ok: false, error: "illegal" });
    expect(pickCards(room, decider(room), seq(room), "nope", false, 0)).toEqual(
      { ok: false, error: "bad-pick" },
    );
  });

  it("a player gone 5 minutes lets the other claim the win; the record ends with the gone player's concede", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    setConnected(room, "P2", false, 1000);
    expect(claimWin(room, "P1", 1000 + CLAIM_AFTER_MS - 1).ok).toBe(false);
    expect(seatMessage(room, "P1", 1000 + CLAIM_AFTER_MS).canClaim).toBe(true);
    expect(claimWin(room, "P1", 1000 + CLAIM_AFTER_MS).ok).toBe(true);
    expect(room.data.record?.outcome?.winner).toBe("P1");
    expect(room.data.record?.h2hEnd).toBe("claimed");
    expect(room.data.record?.actions.at(-1)).toEqual({
      type: "concede",
      player: "P2",
    });
  });

  it("both gone 30 minutes: abandoned, no winner, the record kept; a finished room drops after 10 minutes", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    setConnected(room, "P1", false, 0);
    setConnected(room, "P2", false, 60_000);
    expect(sweepVerdict(room, ABANDON_AFTER_MS)).toBeNull();
    expect(sweepVerdict(room, 60_000 + ABANDON_AFTER_MS)).toBe("abandon");
    abandon(room, 60_000 + ABANDON_AFTER_MS);
    expect(room.data.record?.outcome).toEqual({
      winner: null,
      reason: "abandoned",
    });
    expect(phaseOf(room)).toBe("over");
    expect(
      sweepVerdict(room, 60_000 + ABANDON_AFTER_MS + KEEP_FINISHED_MS),
    ).toBe("drop");
  });

  it("a game that never started is dropped once everyone in it is gone 30 minutes", () => {
    const room = createRoom({
      gameId: GAME_ID,
      seed: 1,
      mode: "casual",
      creator: alice,
      now: 0,
    });
    expect(sweepVerdict(room, ABANDON_AFTER_MS)).toBe("drop");
  });

  it("the history view gets that seat's past boards only", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    for (let i = 0; i < 10; i++)
      act(room, decider(room), seq(room), firstMove(room), i);
    const past = historyBoard(room, "P1", 3);
    expect(past?.bottom).toBe("P1");
    const p2Hand =
      (room.states[3] as GameState).players.find((p) => p.id === "P2")?.hand ??
      [];
    const text = JSON.stringify(past);
    for (const card of p2Hand)
      expect(text).not.toContain(`"${card.instanceId}"`);
    expect(historyBoard(room, "P1", 99_999)).toBeNull();
    expect(historyBoard(room, "P1", Number.NaN)).toBeNull();
  });

  it("M9b: each step carries the seat's board after it, and the other player's hidden picks read hidden", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    for (let i = 0; i < 60 && phaseOf(room) === "playing"; i++)
      act(room, decider(room), seq(room), firstMove(room), i);
    const n = seq(room);
    for (const seat of ["P1", "P2"] as const) {
      const steps = stepsFor(room, seat, n - 5);
      expect(steps.map((s) => s.seq)).toEqual([n - 4, n - 3, n - 2, n - 1, n]);
      expect(steps.every((s) => s.model.bottom === seat)).toBe(true);
      const all = actionsFor(room, seat);
      expect(all).toHaveLength(n);
      room.data.record?.actions.forEach((action, i) => {
        const before = room.states[i] as GameState;
        const choice = before.pendingChoice;
        const hidden =
          action.type === "choose" &&
          action.player !== seat &&
          !!choice &&
          (choice.kind === "nextMonster" || choice.private === true);
        if (hidden) expect(all[i]).toEqual({ ...action, optionId: "hidden" });
        else expect(all[i]).toEqual(action);
      });
    }
  });

  it("M9b: a private choice's pick never reaches the other player", () => {
    const room = newRoom();
    pickFirst(room, room.data.picker ?? "P1", 0);
    let found = false;
    for (let i = 0; i < 2000 && phaseOf(room) === "playing" && !found; i++) {
      const choice = state(room).pendingChoice;
      const move = firstMove(room);
      const at = seq(room);
      act(room, decider(room), at, move, i);
      if (
        move.type === "choose" &&
        choice &&
        (choice.private || choice.kind === "nextMonster")
      ) {
        const other = choice.player === "P1" ? "P2" : "P1";
        expect(actionFor(room, other, at)).toMatchObject({
          optionId: "hidden",
        });
        expect(actionFor(room, choice.player as "P1" | "P2", at)).toEqual(move);
        expect(JSON.stringify(stepsFor(room, other, at))).not.toContain(
          `"optionId":"${move.optionId}"`,
        );
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("the claim time is in each message (the browser counts it down), 5 minutes unless set shorter", () => {
    const room = newRoom();
    expect(seatMessage(room, "P1", 0).claimAfterMs).toBe(CLAIM_AFTER_MS);
    const short = createRoom({
      gameId: GAME_ID,
      seed: 1,
      mode: "casual",
      creator: alice,
      now: 0,
      claimAfterMs: 4000,
    });
    joinRoom(short, bob, () => "P1");
    setConnected(short, "P1", true, 0);
    pickFirst(short, "P1", 0);
    setConnected(short, "P2", false, 0);
    expect(seatMessage(short, "P1", 0).claimAfterMs).toBe(4000);
    expect(claimWin(short, "P1", 3999).ok).toBe(false);
    expect(claimWin(short, "P1", 4000).ok).toBe(true);
  });

  it("M9c: a picker gone 5 minutes lets the other player make the First / Second pick (6.3.1.4)", () => {
    const room = newRoom("casual", "P2");
    setConnected(room, "P2", false, 1000);
    expect(seatMessage(room, "P1", 1000).canPick).toBe(false);
    expect(pickFirst(room, "P1", 0, 1000 + CLAIM_AFTER_MS - 1)).toEqual({
      ok: false,
      error: "not-your-pick",
    });
    expect(seatMessage(room, "P1", 1000 + CLAIM_AFTER_MS).canPick).toBe(true);
    expect(pickFirst(room, "P1", 1, 1000 + CLAIM_AFTER_MS)).toEqual({
      ok: true,
    });
    expect(room.data.record?.firstPick).toEqual({ player: "P1", card: 1 });
    expect(phaseOf(room)).toBe("playing");
  });

  it("M9c: only the creator can cancel, and only before anyone joins", () => {
    const room = createRoom({
      gameId: GAME_ID,
      seed: 1,
      mode: "casual",
      creator: alice,
      now: 0,
    });
    expect(canCancel(room, "P1")).toBe(true);
    expect(canCancel(room, "P2")).toBe(false);
    joinRoom(room, bob, () => "P1");
    expect(canCancel(room, "P1")).toBe(false);
  });
});
