import { describe, expect, it } from "vitest";
import { deckOptions } from "./decks";
import { type Action, getLegalActions, stateHash } from "@gojisim/engine";
import {
  canUndoSession,
  newSession,
  sessionFromRecord,
  undoSession,
  withAction,
} from "./session";
import type { DeckOption } from "./decks";

const decks = () => {
  const [a, b] = deckOptions([]);
  if (!a || !b) throw new Error("no decks");
  return [a, b] as [DeckOption, DeckOption];
};

describe("confirmSingleOption seats (M5d, renamed in M5e)", () => {
  it("/play: only human seats confirm single options; bots never get the one-option choice", () => {
    const bot = { kind: "bot", difficulty: 55 } as const;
    const human = { kind: "human" } as const;
    const vsBot = newSession(
      1,
      decks(),
      { P1: human, P2: bot },
      {
        confirmTargets: true,
      },
    );
    expect(vsBot.record.confirmSingleOption).toEqual(["P1"]);
    expect(vsBot.states[0]?.confirmSingleOption).toEqual(["P1"]);
    const hotseat = newSession(
      1,
      decks(),
      { P1: human, P2: human },
      {
        confirmTargets: true,
      },
    );
    expect(hotseat.states[0]?.confirmSingleOption).toEqual(["P1", "P2"]);
    const bots = newSession(
      1,
      decks(),
      { P1: bot, P2: bot },
      {
        confirmTargets: true,
      },
    );
    expect(bots.states[0]?.confirmSingleOption).toBeUndefined();
  });

  it("/debug (no option) never sets it, and a loaded record keeps what it recorded", () => {
    const session = newSession(1, decks(), {
      P1: { kind: "human" },
      P2: { kind: "human" },
    });
    expect(session.record.confirmSingleOption).toBeUndefined();
    const confirming = newSession(
      1,
      decks(),
      { P1: { kind: "human" }, P2: { kind: "bot", difficulty: 55 } },
      { confirmTargets: true },
    );
    const loaded = sessionFromRecord(JSON.stringify(confirming.record));
    expect(loaded.record.confirmSingleOption).toEqual(["P1"]);
    expect(loaded.states[0]?.confirmSingleOption).toEqual(["P1"]);
  });
});

describe("First / Second pick and Casual undo (M5e)", () => {
  const human = { kind: "human" } as const;
  const bot = { kind: "bot", difficulty: 55 } as const;

  it("the record stores the pick and the mode, and a loaded record keeps both", () => {
    const session = newSession(
      4,
      decks(),
      { P1: human, P2: bot },
      { firstPick: { player: "P1", card: 1 }, mode: "tournament" },
    );
    expect(session.record.firstPick).toEqual({ player: "P1", card: 1 });
    expect(session.record.mode).toBe("tournament");
    const loaded = sessionFromRecord(JSON.stringify(session.record));
    expect(loaded.record.firstPick).toEqual({ player: "P1", card: 1 });
    expect(loaded.record.mode).toBe("tournament");
    expect(loaded.states[0]?.firstPlayer).toBe(session.states[0]?.firstPlayer);
  });

  /** A hotseat game advanced to the first battle card play, then that play. */
  function afterAPlay(mode: "casual" | "tournament") {
    let session = newSession(2, decks(), { P1: human, P2: human }, { mode });
    for (let i = 0; i < 40; i++) {
      const state = session.states[session.position];
      if (!state) throw new Error("no state");
      const player = (state.pendingChoice?.player ?? state.turnPlayer) as
        "P1" | "P2";
      const legal = getLegalActions(state, player);
      const play = legal.find((a) => a.type === "playBattle");
      if (play) return { session: withAction(session, play), player };
      session = withAction(session, legal[0] as Action);
    }
    throw new Error("no battle card play");
  }

  it("Casual: undo replays the record without the last action and restores the exact state", () => {
    const { session, player } = afterAPlay("casual");
    expect(canUndoSession(session, player)).toBe(true);
    const undone = undoSession(session);
    const before = session.states[session.position - 1];
    expect(undone.record.actions).toEqual(session.record.actions.slice(0, -1));
    expect(undone.position).toBe(session.position - 1);
    expect(JSON.stringify(undone.states[undone.position])).toBe(
      JSON.stringify(before),
    );
    expect(stateHash(undone.states[undone.position] as never)).toBe(
      stateHash(before as never),
    );
  });

  it("Tournament: no undo, and none while viewing an earlier position", () => {
    const { session, player } = afterAPlay("tournament");
    expect(canUndoSession(session, player)).toBe(false);
    const casual = afterAPlay("casual");
    expect(
      canUndoSession(
        { ...casual.session, position: casual.session.position - 1 },
        casual.player,
      ),
    ).toBe(false);
  });
});
