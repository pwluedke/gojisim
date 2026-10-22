import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameState,
  ZONE_NUMBERS,
} from "../src";
import { testCard, testDeck, testGameOptions } from "./fixtures/cards";

const deckOrder = (state: GameState) =>
  state.players.map((p) => ({
    deck: p.deck.map((c) => c.cardId),
    hand: p.hand.map((c) => c.cardId),
  }));

describe("createGame setup (6.3.1)", () => {
  it("6.3.1.3, 6.3.1.4 same seed twice gives identical deck order and first player (case 9)", () => {
    const first = createGame(testGameOptions(1234));
    const second = createGame(testGameOptions(1234));
    expect(deckOrder(second)).toEqual(deckOrder(first));
    expect(second.firstPlayer).toBe(first.firstPlayer);
    expect(second).toEqual(first);
  });

  it("6.3.1.3 the main deck is actually shuffled, and different seeds give different orders", () => {
    const a = createGame(testGameOptions(1));
    const b = createGame(testGameOptions(2));
    const printed = testDeck("alice", 0).mainDeck.map((c) => c.id);
    const aliceA = [...a.players[0].hand, ...a.players[0].deck].map(
      (c) => c.cardId,
    );
    expect(aliceA).not.toEqual(printed);
    expect([...aliceA].sort()).toEqual([...printed].sort());
    expect(deckOrder(a)).not.toEqual(deckOrder(b));
  });

  it("6.3.1.4 the first player comes from the seeded RNG; both players go first for some seed", () => {
    const firsts = new Set(
      Array.from(
        { length: 20 },
        (_, s) => createGame(testGameOptions(s)).firstPlayer,
      ),
    );
    expect(firsts).toEqual(new Set(["alice", "bob"]));
    const state = createGame(testGameOptions(7));
    expect(state.turnPlayer).toBe(state.firstPlayer);
  });

  it("6.3.1.5 to 6.3.1.7 new game: hands of 5, rank I monsters in zone 1, rage 0 (case 10)", () => {
    const state = createGame(testGameOptions());
    for (const player of state.players) {
      expect(player.hand).toHaveLength(5);
      expect(player.deck).toHaveLength(45);
      expect(player.invadingMonsterZone).toHaveLength(1);
      const monster =
        state.cards[player.invadingMonsterZone[0]?.cardId as number];
      expect(monster).toMatchObject({ type: "Monster", rank: 1 });
      expect(player.monsterPosition).toBe(1);
      expect(player.rage).toBe(0);
    }
  });

  it("6.3.1.2 the other 3 monster cards stay in the monster deck zone", () => {
    const state = createGame(testGameOptions());
    for (const player of state.players) {
      const ranks = player.monsterDeck.map((c) => state.cards[c.cardId]?.rank);
      expect(ranks.sort()).toEqual([2, 3, 4]);
    }
  });

  it("6.3.1 setup steps are logged in rule order", () => {
    const state = createGame(testGameOptions());
    expect(state.log.map((e) => [e.seq, e.type, e.payload["rule"]])).toEqual([
      [1, "presentDecks", "6.3.1.1"],
      [2, "presentDecks", "6.3.1.1"],
      [3, "placeMonsterDeck", "6.3.1.2"],
      [4, "placeMonsterDeck", "6.3.1.2"],
      [5, "shuffleDeck", "6.3.1.3"],
      [6, "shuffleDeck", "6.3.1.3"],
      [7, "chooseFirstPlayer", "6.3.1.4"],
      [8, "draw", "6.3.1.5"],
      [9, "draw", "6.3.1.5"],
      [10, "setInvadingMonster", "6.3.1.6"],
      [11, "setInvadingMonster", "6.3.1.6"],
      [12, "setRage", "6.3.1.7"],
      [13, "setRage", "6.3.1.7"],
    ]);
    expect(state.log.find((e) => e.type === "chooseFirstPlayer")?.player).toBe(
      state.firstPlayer,
    );
  });

  it("6.3.1.6 the rank I monster is found wherever it is in the monster deck", () => {
    const alice = testDeck("alice", 0);
    alice.monsterDeck.reverse();
    const state = createGame({ seed: 5, players: [alice, testDeck("bob", 1)] });
    expect(
      state.cards[state.players[0].invadingMonsterZone[0]?.cardId as number]
        ?.rank,
    ).toBe(1);
  });

  it("6.3.1.6 a monster deck with no rank I monster cannot start a game", () => {
    const alice = testDeck("alice", 0);
    alice.monsterDeck = alice.monsterDeck.filter((c) => c.rank !== 1);
    expect(() =>
      createGame({ seed: 5, players: [alice, testDeck("bob", 1)] }),
    ).toThrow(/rank I/);
  });

  it("1.1.1 a game needs 2 players with different ids", () => {
    expect(() =>
      createGame({ seed: 1, players: [testDeck("x", 0), testDeck("x", 1)] }),
    ).toThrow();
  });

  it("6.3.1 the turn starts at turn 1, start phase, with no per-turn actions used", () => {
    const state = createGame(testGameOptions());
    expect(state).toMatchObject({
      turn: 1,
      phase: "start",
      step: "7.2.1",
      turnFlags: { invasionUsed: false, monsterPlayed: false },
      result: null,
      resolutionArea: [],
    });
    for (const player of state.players) {
      for (const zone of ZONE_NUMBERS) expect(player.zones[zone]).toEqual([]);
      expect(player.strategyZones).toEqual([[], []]);
      expect(player.discard).toEqual([]);
    }
  });
});

describe("card identity (4.1.4)", () => {
  it("4.1.4 every card instance is unique, and a card moved to another area gets a fresh id", () => {
    const state = createGame(testGameOptions());
    const all = state.players.flatMap((p) => [
      ...p.monsterDeck,
      ...p.invadingMonsterZone,
      ...p.deck,
      ...p.hand,
    ]);
    expect(all).toHaveLength(108);
    expect(new Set(all.map((c) => c.instanceId)).size).toBe(108);
    // 108 instances placed in 6.3.1.2/6.3.1.3, then 10 draws and 2 monsters moved: 120 ids issued.
    expect(state.nextInstanceId).toBe(121);
    const handIds = state.players.flatMap((p) =>
      p.hand.map((c) => Number(c.instanceId.slice(1))),
    );
    expect(Math.min(...handIds)).toBeGreaterThan(108);
  });

  it("4.1.4 cardId links every instance back to its card data", () => {
    const state = createGame(testGameOptions());
    for (const player of state.players) {
      for (const card of [
        ...player.deck,
        ...player.hand,
        ...player.monsterDeck,
        ...player.invadingMonsterZone,
      ]) {
        expect(state.cards[card.cardId]?.id).toBe(card.cardId);
        expect(card.owner).toBe(player.id);
      }
    }
  });
});

describe("engine API", () => {
  it("Engine: game state is plain JSON: it survives a JSON round trip unchanged", () => {
    const state = createGame(testGameOptions());
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("Engine: accepts string seeds deterministically", () => {
    expect(createGame(testGameOptions("game-1"))).toEqual(
      createGame(testGameOptions("game-1")),
    );
  });

  it("Engine: rejects two different cards with the same id", () => {
    const alice = testDeck("alice", 0);
    const bob = testDeck("bob", 1);
    bob.mainDeck[0] = testCard({
      id: alice.mainDeck[0]?.id as number,
      name: "impostor",
    });
    expect(() => createGame({ seed: 1, players: [alice, bob] })).toThrow(
      /share id/,
    );
  });

  it("1.2.3 right after setup the only legal action is to concede; the start phase has not run", () => {
    const state = createGame(testGameOptions());
    expect(getLegalActions(state, state.turnPlayer)).toEqual([
      { type: "concede", player: state.turnPlayer },
    ]);
  });

  it("Engine: applyAction rejects an action outside the play timing", () => {
    const state = createGame(testGameOptions());
    expect(() =>
      applyAction(state, { type: "pass", player: state.turnPlayer }),
    ).toThrow(/Illegal action/);
  });
});
