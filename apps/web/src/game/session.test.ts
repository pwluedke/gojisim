import { describe, expect, it } from "vitest";
import { deckOptions } from "./decks";
import { type Action, getLegalActions, stateHash } from "@gojisim/engine";
import {
  canUndoSession,
  newSession,
  prePickSession,
  sessionFromRecord,
  undoSession,
  withAction,
} from "./session";
import type { DeckOption } from "./decks";
import type { Session } from "./session";
import { buildLog } from "../play/logLines";

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
    // Two human seats, as `/debug` has.
    const twoHumans = newSession(
      1,
      decks(),
      { P1: human, P2: human },
      {
        confirmTargets: true,
      },
    );
    expect(twoHumans.states[0]?.confirmSingleOption).toEqual(["P1", "P2"]);
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

  it("M5h #13: Show opponent's hand flags the record (no statistics, M11), and a loaded record keeps it", () => {
    const shown = newSession(
      4,
      decks(),
      { P1: human, P2: bot },
      {
        showOpponentHand: true,
      },
    );
    expect(shown.record.showOpponentHand).toBe(true);
    expect(
      sessionFromRecord(JSON.stringify(shown.record)).record.showOpponentHand,
    ).toBe(true);
    const plain = newSession(4, decks(), { P1: human, P2: bot });
    expect(plain.record.showOpponentHand).toBeUndefined();
  });

  it("6.3.1.4: a peek at the First / Second cards flags the record (no statistics, M11), and a loaded record keeps it", () => {
    const peeked = newSession(
      4,
      decks(),
      { P1: human, P2: bot },
      { firstPick: { player: "P1", card: 0 }, firstPickPeeked: true },
    );
    expect(peeked.record.firstPickPeeked).toBe(true);
    expect(
      sessionFromRecord(JSON.stringify(peeked.record)).record.firstPickPeeked,
    ).toBe(true);
    const plain = newSession(4, decks(), { P1: human, P2: bot });
    expect(plain.record.firstPickPeeked).toBeUndefined();
    // The flag is information only: the game is the same.
    const unpeeked = newSession(
      4,
      decks(),
      { P1: human, P2: bot },
      { firstPick: { player: "P1", card: 0 } },
    );
    expect(peeked.states[0]?.firstPlayer).toBe(unpeeked.states[0]?.firstPlayer);
  });

  it("6.3.1.3 and 6.3.1.4: the board before the pick has both decks in place, no hands, no monsters and an empty log; the decks are the same whichever card is picked", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const [zero, one] = ([0, 1] as const).map((card) =>
        newSession(
          seed,
          decks(),
          { P1: human, P2: bot },
          { firstPick: { player: "P1", card } },
        ),
      ) as [Session, Session];
      // The two cards read differently: one gives P1 first, the other second.
      expect(zero.states[0]?.firstPlayer).not.toBe(one.states[0]?.firstPlayer);
      const before = prePickSession(zero).states[0];
      if (!before) throw new Error("no state");
      expect(before.log).toEqual([]);
      expect(before.pendingChoice).toBeNull();
      for (const [i, player] of before.players.entries()) {
        const started = zero.states[0]?.players[i];
        const other = one.states[0]?.players[i];
        if (!started || !other) throw new Error("no player");
        expect(player.hand).toEqual([]);
        expect(player.invadingMonsterZone).toEqual([]);
        expect(player.monsterPosition).toBeNull();
        // Every card is back in its deck: 50 main deck cards, the whole monster deck.
        expect(player.deck).toHaveLength(
          started.deck.length + started.hand.length,
        );
        expect(player.monsterDeck).toHaveLength(
          started.monsterDeck.length + started.invadingMonsterZone.length,
        );
        // The same cards in the same order whichever card is picked (shuffled before 6.3.1.4).
        const ids = (p: typeof started) =>
          [...p.hand, ...p.deck].map((c) => c.cardId);
        expect(ids(other)).toEqual(ids(started));
      }
    }
  });

  /** A game with two human seats (as in `/debug`) advanced to the first battle card play. */
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

  it("M5h #10: an undo is kept in the record (who, when, what), counted per player, and never replayed", () => {
    const { session, player } = afterAPlay("casual");
    const action = session.record.actions.at(-1);
    const undone = undoSession(session);
    expect(undone.record.undos).toHaveLength(1);
    const [entry] = undone.record.undos ?? [];
    expect(entry?.player).toBe(player);
    expect(entry?.action).toEqual(action);
    expect(entry?.index).toBe(session.record.actions.length - 1);
    expect(entry?.label).toMatch(/battle card|zone/i);
    expect(Number.isNaN(Date.parse(entry?.at ?? ""))).toBe(false);
    expect(undone.record.undoCount).toEqual({ [player]: 1 });
    // A loaded record keeps them; replay reads only `actions`.
    const loaded = sessionFromRecord(JSON.stringify(undone.record));
    expect(loaded.record.undos).toEqual(undone.record.undos);
    expect(loaded.record.undoCount).toEqual({ [player]: 1 });
    expect(loaded.record.actions).toEqual(undone.record.actions);
    // The log lists it as an "Undone" line.
    const lines = buildLog(loaded, player, (id) => id);
    expect(
      lines.filter((l) => l.kind === "undone").map((l) => l.parts.join("")),
    ).toEqual([`Undone: ${player}: ${entry?.label}`]);
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

describe("deck names in the record (M5h #18)", () => {
  it("a new game records each seat's deck name, and a loaded record keeps them", () => {
    const human = { kind: "human" } as const;
    const bot = { kind: "bot", difficulty: 55 } as const;
    const [a, b] = decks();
    const session = newSession(3, [a, b], { P1: human, P2: bot });
    expect(session.record.deckNames).toEqual({ P1: a.label, P2: b.label });
    const loaded = sessionFromRecord(JSON.stringify(session.record));
    expect(loaded.record.deckNames).toEqual({ P1: a.label, P2: b.label });
    // An older record has none; the fight card reads "Mystery Deck".
    const { deckNames: _, ...old } = session.record;
    expect(
      sessionFromRecord(JSON.stringify(old)).record.deckNames,
    ).toBeUndefined();
  });
});
