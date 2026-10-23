import { afterEach, describe, expect, it } from "vitest";
import {
  type Action,
  advanceToDecision,
  applyAction,
  canUndo,
  checkInvariants,
  createGame,
  type GameRecord,
  type GameState,
  getLegalActions,
  type PlayerState,
  replayAll,
  startGame,
  stateHash,
  undoBoundary,
  undoLast,
} from "../src";
import { setTestAbilities, registerCustomEffect } from "../src/testing";
import { randomInt } from "../src/rng";
import { appendLog } from "../src/state";
import { testDeck, testGameOptions } from "./fixtures/cards";
import {
  atPlayTiming,
  inHand,
  monster,
  onDeck,
  place,
  real,
} from "./fixtures/real";
import {
  addCard,
  battleCard,
  nonTurnPlayer,
  turnPlayer,
} from "./fixtures/state";

const after = (state: GameState, action: Action) =>
  advanceToDecision(applyAction(state, action));

const answer = (state: GameState, optionId: string): GameState => {
  const choice = state.pendingChoice;
  if (!choice) throw new Error("No pending choice");
  return applyAction(state, {
    type: "choose",
    player: choice.player,
    choiceId: choice.id,
    optionId,
  });
};

describe("First / Second pick (M5e)", () => {
  const first = (pick?: GameRecord["firstPick"], seed: number | string = 42) =>
    createGame({
      ...testGameOptions(seed),
      ...(pick ? { firstPick: pick } : {}),
    });

  it("6.3.1.4: one seeded draw shuffles the two cards; the picker of First goes first", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const random = first(undefined, seed).firstPlayer;
      // Picking the card with your own seat's index gives the same first player as before, and
      // the other card gives the other player.
      const own = first({ player: "alice", card: 0 }, seed);
      const other = first({ player: "alice", card: 1 }, seed);
      expect(own.firstPlayer).toBe(random);
      expect(other.firstPlayer).not.toBe(random);
      expect(first({ player: "bob", card: 1 }, seed).firstPlayer).toBe(random);
      const entry = own.log.find((e) => e.type === "chooseFirstPlayer");
      expect(entry?.payload).toMatchObject({
        rule: "6.3.1.4",
        pickedBy: "alice",
        card: 0,
        firstCard: random === "alice" ? 0 : 1,
      });
    }
  });

  it("6.3.1.4: the pick leaves the rest of the random stream unchanged", () => {
    const random = first(undefined, 9);
    const picked = first({ player: "bob", card: 1 }, 9);
    expect(picked.rngState).toBe(random.rngState);
    expect(picked.players.map((p) => p.hand)).toEqual(
      random.players.map((p) => p.hand),
    );
  });

  it("6.3.1.4: a game record carries the pick, so replay reproduces it", () => {
    const record: GameRecord = {
      version: 1,
      seed: 3,
      decks: testGameOptions().players,
      actions: [],
      firstPick: { player: "bob", card: 0 },
    };
    const a = startGame(record);
    expect(startGame(JSON.parse(JSON.stringify(record))).firstPlayer).toBe(
      a.firstPlayer,
    );
    expect(() =>
      createGame({
        ...testGameOptions(),
        firstPick: { player: "carol", card: 0 },
      }),
    ).toThrow("unknown player");
  });
});

describe("confirmSingleOption (M5e): every one-option choice is asked of human seats", () => {
  /** A counter leaves the countered player exactly one next monster (5.15.1.2). */
  function counterWithOneCandidate(
    option: "confirmSingleOption" | "confirmSingleTarget" | null,
  ) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    if (option) state[option] = [opp.id];
    monster(state, opp, real("ESD02-001"), 6);
    opp.rage = 0;
    opp.monsterDeck = [addCard(state, real("ESD02-002"), opp.id)];
    place(
      state,
      me,
      battleCard({ id: 975001, rank: 3, counterOrThreat: 10000 }),
      2,
    );
    return after(state, { type: "pass", player: me.id });
  }

  it("5.15.1.2: a single next monster is a one-option nextMonster choice", () => {
    const paused = counterWithOneCandidate("confirmSingleOption");
    const choice = paused.pendingChoice;
    expect(choice).toMatchObject({ kind: "nextMonster", rule: "5.15.1.2" });
    expect(choice?.options.map((o) => o.cardId)).toEqual([
      real("ESD02-002").id,
    ]);
    const done = advanceToDecision(
      answer(paused, choice?.options[0]?.id ?? ""),
    );
    const opp = done.players.find((p) => p.id === choice?.player);
    expect(opp?.invadingMonsterZone.at(-1)?.cardId).toBe(real("ESD02-002").id);
  });

  it("5.15.1.2: without the option (bots, and M5d's confirmSingleTarget), it is taken automatically", () => {
    // confirmSingleTarget alone keeps M5d's scope (target picks), so older records replay.
    for (const option of [null, "confirmSingleTarget"] as const) {
      const done = counterWithOneCandidate(option);
      expect(done.pendingChoice?.kind).not.toBe("nextMonster");
      expect(
        done.log.some(
          (e) =>
            e.type === "newInvadingMonster" &&
            e.payload["cardId"] === real("ESD02-002").id,
        ),
      ).toBe(true);
    }
  });

  it("5.11.1: a single legal zone for an effect play is a one-option zone choice", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    state.confirmSingleOption = [me.id];
    const source = battleCard({ id: 975010, rank: 1 });
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "enter-play",
          trigger: { on: "enter" },
          effects: [
            {
              effect: "play",
              from: "hand",
              filter: { owner: "you", area: "hand", type: "Battle" },
              count: { exact: 1 },
              zones: [3],
            },
          ],
        },
      ],
    });
    try {
      me.hand = [];
      const card = inHand(state, me, source);
      const other = inHand(state, me, battleCard({ id: 975011, rank: 1 }));
      const played = applyAction(state, {
        type: "playBattle",
        player: me.id,
        cardInstanceId: card.instanceId,
        zone: 2,
      });
      // The one card to play is confirmed first (10.5.3.1), then its one zone.
      expect(played.pendingChoice?.kind).toBe("target");
      const zone = answer(played, other.instanceId);
      expect(zone.pendingChoice).toMatchObject({
        kind: "zone",
        rule: "5.11.1",
      });
      expect(zone.pendingChoice?.options.map((o) => o.id)).toEqual([
        `${me.id}:3`,
      ]);
      const done = answer(zone, `${me.id}:3`);
      expect(turnPlayer(done).zones[3][0]?.[0]?.cardId).toBe(975011);
    } finally {
      setTestAbilities(source.deckCardNumber, null);
    }
  });
});

describe("Casual undo boundaries (M5e)", () => {
  afterEach(() => {
    setTestAbilities(battleCard({ id: 976001 }).deckCardNumber, null);
    registerCustomEffect("undoTest", null);
  });

  /** The turn player plays `card` to zone 2 from the main phase play timing. */
  const playTo2 = (
    state: GameState,
    me: PlayerState,
    card: { instanceId: string },
  ) =>
    after(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone: 2,
    });

  /** A battle card whose [enter] runs `effects` (fixture ability). */
  function withEnter(effects: unknown[]) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const source = battleCard({ id: 976001, rank: 1 });
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "enter-test",
          trigger: { on: "enter" },
          effects: effects as never,
        },
      ],
    });
    const card = inHand(state, me, source);
    return { state, me, next: playTo2(state, me, card) };
  }

  it("a plain play is undoable, and undo restores the exact state (replay, hash, invariants)", () => {
    const record: GameRecord = {
      version: 1,
      seed: 11,
      decks: [testDeck("alice", 0), testDeck("bob", 1)],
      actions: [],
    };
    let state = startGame(record);
    // Pass until a battle card can be played (fixture cards have no abilities), then play it.
    let play: Action | undefined;
    while (!play) {
      const player = state.pendingChoice?.player ?? state.turnPlayer;
      const legal = getLegalActions(state, player);
      play = legal.find((a) => a.type === "playBattle");
      const action = play ?? (legal[0] as Action);
      record.actions.push(action);
      state = after(state, action);
    }
    const n = record.actions.length;
    const states = replayAll(record);
    expect(canUndo(record, states, play.player)).toBe(true);
    const other = play.player === "alice" ? "bob" : "alice";
    expect(canUndo(record, states, other)).toBe(false);
    const undone = undoLast(record);
    expect(undone.record.actions).toHaveLength(n - 1);
    const before = states[n - 1] as GameState;
    expect(JSON.stringify(undone.state)).toBe(JSON.stringify(before));
    expect(stateHash(undone.state)).toBe(stateHash(before));
    expect(checkInvariants(undone.state)).toEqual([]);
    expect(() => undoLast({ ...record, actions: [] })).toThrow(
      "Nothing to undo",
    );
  });

  it("an action by the opponent is a boundary", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const next = playTo2(
      state,
      me,
      inHand(state, me, battleCard({ id: 976002 })),
    );
    const action: Action = { type: "pass", player: me.id };
    expect(undoBoundary(state, next, action, nonTurnPlayer(state).id)).toBe(
      "opponentAction",
    );
  });

  it("7.2.2: a draw is a boundary (passing into the next turn draws)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const action: Action = { type: "pass", player: me.id };
    expect(undoBoundary(state, after(state, action), action, me.id)).toBe(
      "draw",
    );
  });

  it("5.8.1.2: a search that finds nothing is a boundary (ESD01-002 with no target in the deck)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, real("ESD01-002"), 2);
    me.deck = [addCard(state, real("ESD01-003"), me.id)];
    const card = inHand(state, me, battleCard({ id: 976003, invadeZones: 1 }));
    const action: Action = {
      type: "invade",
      player: me.id,
      cardInstanceId: card.instanceId,
    };
    const next = after(state, action);
    expect(next.log.find((e) => e.type === "search")?.payload).toMatchObject({
      found: 0,
    });
    expect(undoBoundary(state, next, action, me.id)).toBe("search");
  });

  it("5.8.1: an open search pick is a boundary: the searcher has seen the deck", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, real("ESD01-002"), 2);
    onDeck(state, me, real("ESD01-006"));
    const card = inHand(state, me, battleCard({ id: 976004, invadeZones: 1 }));
    const action: Action = {
      type: "invade",
      player: me.id,
      cardInstanceId: card.instanceId,
    };
    const next = after(state, action);
    expect(next.pendingChoice).toMatchObject({ rule: "5.8.1", private: true });
    expect(next.log.some((e) => e.type === "search")).toBe(false);
    expect(undoBoundary(state, next, action, me.id)).toBe("search");
  });

  it("5.10.1: a reveal is a boundary", () => {
    registerCustomEffect("undoTest", (s, ctx) => {
      const top = turnPlayer(s).deck[0];
      if (!top) return;
      s.revealed.push(top.instanceId);
      appendLog(s, "reveal", ctx.master, {
        rule: "5.10.1",
        cardId: top.cardId,
      });
    });
    const { state, me, next } = withEnter([
      { effect: "custom", handler: "undoTest" },
    ]);
    expect(
      undoBoundary(state, next, { type: "pass", player: me.id }, me.id),
    ).toBe("reveal");
  });

  it("a shuffle is a boundary", () => {
    const { state, me, next } = withEnter([
      { effect: "shuffle", player: "you" },
    ]);
    expect(
      undoBoundary(state, next, { type: "pass", player: me.id }, me.id),
    ).toBe("shuffle");
  });

  it("any random result is a boundary", () => {
    registerCustomEffect("undoTest", (s) => {
      randomInt(s, 6);
    });
    const { state, me, next } = withEnter([
      { effect: "custom", handler: "undoTest" },
    ]);
    expect(
      undoBoundary(state, next, { type: "pass", player: me.id }, me.id),
    ).toBe("random");
  });

  it("1.2.3: the end of the game is a boundary (a concession can't be undone)", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const action: Action = { type: "concede", player: me.id };
    expect(undoBoundary(state, after(state, action), action, me.id)).toBe(
      "gameOver",
    );
  });
});
