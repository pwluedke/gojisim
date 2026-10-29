import { describe, expect, it } from "vitest";
import { type Action, getLegalActions, type GameState } from "@gojisim/engine";
import {
  fetchConfig,
  latestBotMove,
  testSiteEnabled,
  uploadRecord,
  withBugReport,
  withFeedback,
  withOpponentHandShown,
} from "./collection";
import { type DeckOption, deckOptions } from "./decks";
import {
  newSession,
  type Session,
  sessionFromRecord,
  undoSession,
  withAction,
} from "./session";

const decks = () => {
  const [a, b] = deckOptions([]);
  if (!a || !b) throw new Error("no decks");
  return [a, b] as [DeckOption, DeckOption];
};
const human = { kind: "human" } as const;
const bot = { kind: "bot", difficulty: 90 } as const;

/** Plays the first legal non-concede action for whoever decides, `n` times. */
function play(session: Session, n: number): Session {
  let current = session;
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

describe("game collection in the browser (M13b)", () => {
  it("Bad Bot! marks the bot's latest action, and nothing before the bot has acted", () => {
    const start = newSession(2, decks(), { P1: human, P2: bot });
    expect(latestBotMove(start)).toBeNull();
    // Play until the bot has acted, then a few more moves.
    let session = start;
    while (!session.record.actions.some((a) => a.player === "P2"))
      session = play(session, 1);
    session = play(session, 3);
    const move = latestBotMove(session);
    const index = session.record.actions.map((a) => a.player).lastIndexOf("P2");
    expect(move?.actionIndex).toBe(index);
    expect(move?.label).toMatch(/^Bot \(Hard\): /);
    expect(move?.when).toMatch(/^Turn \d+, (Start|Main|Counter|End) phase$/);
  });

  it("reports and bug notes are added to the record and kept through a reload", () => {
    const session = play(newSession(3, decks(), { P1: human, P2: bot }), 4);
    const feedback = {
      actionIndex: 1,
      label: "Bot (Hard): Pass (Turn 1, Main phase)",
      text: "passed with a play left",
      reporter: "Dr. Serizawa",
      at: "2026-10-28T12:00:00.000Z",
    };
    const bug = {
      actionIndex: 4,
      text: "a card vanished",
      reporter: "Dr. Serizawa",
      at: "2026-10-28T12:01:00.000Z",
    };
    const both = withBugReport(withFeedback(session, feedback), bug);
    expect(both.record.botFeedback).toEqual([feedback]);
    expect(both.record.bugReports).toEqual([bug]);
    // Information only: the game is the same, and a saved file brings them back.
    expect(both.states).toBe(session.states);
    const loaded = sessionFromRecord(JSON.stringify(both.record));
    expect(loaded.record.botFeedback).toEqual([feedback]);
    expect(loaded.record.bugReports).toEqual([bug]);
  });

  it("Show opponent's hand flags the record once, at the index it was turned on; a game started with it is flagged at 0", () => {
    const session = play(newSession(4, decks(), { P1: human, P2: bot }), 3);
    const shown = withOpponentHandShown(session);
    expect(shown.record).toMatchObject({
      showOpponentHand: true,
      showOpponentHandAt: 3,
      excludedFromAchievements: true,
    });
    // Turning it on again later keeps the first index.
    expect(
      withOpponentHandShown(play(shown, 2)).record.showOpponentHandAt,
    ).toBe(3);
    const fromStart = newSession(
      4,
      decks(),
      { P1: human, P2: bot },
      {
        showOpponentHand: true,
      },
    );
    expect(fromStart.record).toMatchObject({
      showOpponentHand: true,
      showOpponentHandAt: 0,
      excludedFromAchievements: true,
    });
    const loaded = sessionFromRecord(JSON.stringify(shown.record));
    expect(loaded.record.showOpponentHandAt).toBe(3);
    expect(loaded.record.excludedFromAchievements).toBe(true);
  });

  it("every game gets a gameId (a UUID) that actions, undo and reloading keep; an older record gets one when loaded", () => {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const start = newSession(6, decks(), { P1: human, P2: bot });
    const id = start.record.gameId;
    expect(id).toMatch(uuid);
    // Another game, another id.
    expect(
      newSession(6, decks(), { P1: human, P2: bot }).record.gameId,
    ).not.toBe(id);
    const played = play(start, 4);
    expect(played.record.gameId).toBe(id);
    expect(undoSession(played).record.gameId).toBe(id);
    expect(sessionFromRecord(JSON.stringify(played.record)).record.gameId).toBe(
      id,
    );
    const { gameId: _gameId, ...older } = played.record;
    const loaded = sessionFromRecord(JSON.stringify(older)).record.gameId;
    expect(loaded).toMatch(uuid);
    expect(loaded).not.toBe(id);
  });

  it("the Test Site is on only when the server says so; an unreadable config leaves it off", async () => {
    expect(testSiteEnabled({ testSite: true })).toBe(true);
    expect(testSiteEnabled({ testSite: false })).toBe(false);
    expect(testSiteEnabled(null)).toBe(false);
    const answer = (body: unknown, ok = true) =>
      (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    expect(await fetchConfig(answer({ testSite: true }))).toEqual({
      testSite: true,
    });
    expect(await fetchConfig(answer({}, false))).toBeNull();
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchConfig(down)).toBeNull();
  });

  it("an upload posts the record with its position, and reports whether the server stored it", async () => {
    const session = play(newSession(5, decks(), { P1: human, P2: bot }), 2);
    const sent: { url: string; body: string }[] = [];
    const server = (ok: boolean) =>
      (async (url: string, init: RequestInit) => {
        sent.push({ url, body: String(init.body) });
        return { ok };
      }) as unknown as typeof fetch;
    expect(await uploadRecord(session, server(true))).toBe(true);
    expect(sent[0]?.url).toBe("/api/games");
    expect(JSON.parse(sent[0]?.body ?? "{}")).toMatchObject({
      seed: 5,
      position: 2,
      actions: session.record.actions,
    });
    expect(await uploadRecord(session, server(false))).toBe(false);
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await uploadRecord(session, down)).toBe(false);
  });
});
