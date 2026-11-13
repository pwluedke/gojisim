import {
  type Action,
  boardModel,
  type GameState,
  getLegalActions,
  getPlayerView,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { uploadRecord } from "../game/collection";
import { type DeckOption, deckOptions } from "../game/decks";
import { newSession, type Session, withAction } from "../game/session";
import type { SeatMessage } from "./client";
import { applyMessage, withHistoryBoard } from "./onlineSession";
import { HIDDEN_CARD_ID, isHidden, stateFromView } from "./shadow";

/*
 * M9b: a head to head game in the browser, from the server's messages. A real local game stands
 * in for the server's: its states give the messages a seat would get.
 */

const decks = () => {
  const [a, b] = deckOptions([]);
  if (!a || !b) throw new Error("no decks");
  return [a, b] as [DeckOption, DeckOption];
};

/** A real game played `n` actions with the first legal non-concede action. */
function game(n: number): Session {
  let current = newSession(5, decks(), {
    P1: { kind: "human" },
    P2: { kind: "human" },
  });
  for (let i = 0; i < n; i++) {
    const state = current.states[current.position] as GameState;
    const who = state.pendingChoice?.player ?? state.turnPlayer;
    const action = getLegalActions(state, who).find(
      (a) => a.type !== "concede",
    ) as Action;
    current = withAction(current, action);
  }
  return current;
}

/** The message seat P1 would get at action count `seq`, with the steps after `from`. */
function message(g: Session, seq: number, from = seq): SeatMessage {
  const state = g.states[seq] as GameState;
  return {
    gameId: "0f8b6c3e-4b7a-4c1e-9d2a-5e6f7a8b9c0d",
    phase: "playing",
    you: "P1",
    mode: "casual",
    picker: "P1",
    opponent: { name: "Bo", connected: true, goneMs: 0, deckName: null },
    seq,
    model: boardModel(state, "P1"),
    legal: getLegalActions(state, "P1"),
    undo: { asked: null, canAsk: false },
    canClaim: false,
    claimAfterMs: 300_000,
    canPick: false,
    outcome: null,
    h2hEnd: null,
    names: { P1: "Ann", P2: "Bo" },
    yourDeckName: "Ann's deck",
    rematch: {
      by: null,
      youReady: false,
      declined: null,
      gameId: null,
      canOffer: false,
    },
    steps: g.record.actions.slice(from, seq).map((action, i) => ({
      seq: from + i + 1,
      action,
      model: boardModel(g.states[from + i + 1] as GameState, "P1"),
    })),
  };
}

describe("a head to head game in the browser (M9b)", () => {
  it("the display state has the seat's own cards and every hidden card as a placeholder, counts kept", () => {
    const g = game(6);
    const real = g.states[6] as GameState;
    const shadow = stateFromView(getPlayerView(real, "P1"));
    const [p1, p2] = real.players;
    const [s1, s2] = shadow.players;
    expect(s1.hand).toEqual(p1.hand);
    expect(s2.hand).toHaveLength(p2.hand.length);
    expect(s2.hand.every(isHidden)).toBe(true);
    expect(s1.deck).toHaveLength(p1.deck.length);
    expect(s1.deck.every(isHidden)).toBe(true);
    expect(s2.monsterDeck.every(isHidden)).toBe(true);
    expect(s1.discard).toEqual(p1.discard);
    expect(s1.invadingMonsterZone).toEqual(p1.invadingMonsterZone);
    expect(shadow.cards[HIDDEN_CARD_ID]).toBeUndefined();
    // Nothing of the other hand: no instance id, no card data the view doesn't name.
    const text = JSON.stringify(shadow);
    for (const card of p2.hand)
      expect(text).not.toContain(`"${card.instanceId}"`);
    expect(shadow.seed).toBe(0);
    expect(shadow.rngState).toBe(0);
  });

  it("messages build /play's session: steps extend it, the opponent is an online seat, the deck a Mystery deck", () => {
    const g = game(8);
    let online = applyMessage(
      null,
      message(g, 3),
      g.record.actions.slice(0, 3),
    );
    expect(online?.session.record.actions).toHaveLength(3);
    expect(online?.session.seats).toEqual({
      P1: { kind: "human" },
      P2: { kind: "online" },
    });
    expect(online?.session.record.deckNames).toEqual({ P1: "Ann's deck" });
    expect(online?.session.record.h2h).toBe(true);
    online = applyMessage(online, message(g, 8, 3));
    expect(online?.session.record.actions).toEqual(g.record.actions);
    expect(online?.session.states).toHaveLength(9);
    expect(online?.session.position).toBe(8);
    expect(online?.models[5]).toEqual(
      boardModel(g.states[5] as GameState, "P1"),
    );
    // The first message's earlier boards come from the server when the history view asks.
    expect(online?.models[1]).toBeNull();
    const filled = withHistoryBoard(
      online!,
      1,
      boardModel(g.states[1] as GameState, "P1"),
    );
    expect(filled.models[1]).not.toBeNull();
    expect(filled.session.states[1]?.turn).toBe(
      (g.states[1] as GameState).turn,
    );
    expect(filled.epoch).toBe(online?.epoch);
  });

  it("an undo shortens the game; a gap starts it fresh from the latest board", () => {
    const g = game(8);
    const full = applyMessage(null, message(g, 8), g.record.actions);
    const undone = applyMessage(full, message(g, 6));
    expect(undone?.session.record.actions).toEqual(
      g.record.actions.slice(0, 6),
    );
    expect(undone?.session.states).toHaveLength(7);
    expect(undone?.epoch).toBe(full?.epoch);
    // A message that skips actions the browser never got: a fresh start, counted.
    const behind = applyMessage(
      null,
      message(g, 2),
      g.record.actions.slice(0, 2),
    );
    const jumped = applyMessage(behind, message(g, 8));
    expect(jumped?.session.record.actions).toHaveLength(8);
    expect(jumped?.epoch).toBe((behind?.epoch ?? 0) + 1);
  });

  it("a report from a head to head game uploads as its own file naming the game, never with its id", async () => {
    const g = game(4);
    const online = applyMessage(
      null,
      message(g, 4),
      g.record.actions.slice(0, 4),
    );
    const bodies: Record<string, unknown>[] = [];
    const server = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return { ok: true };
    }) as unknown as typeof fetch;
    expect(await uploadRecord(online!.session, server, false)).toBe(true);
    const sent = bodies[0] ?? {};
    expect(sent["h2hGameId"]).toBe("0f8b6c3e-4b7a-4c1e-9d2a-5e6f7a8b9c0d");
    expect(sent["gameId"]).not.toBe("0f8b6c3e-4b7a-4c1e-9d2a-5e6f7a8b9c0d");
    expect(sent["h2h"]).toBeUndefined();
  });
});
