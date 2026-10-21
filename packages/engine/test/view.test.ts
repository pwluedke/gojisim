import { describe, expect, it } from "vitest";
import {
  createGame,
  type GameState,
  getPlayerView,
  ZONE_NUMBERS,
} from "../src";
import { testGameOptions } from "./fixtures/cards";

function stateWithPublicCards(): GameState {
  const state = createGame(testGameOptions());
  const [alice] = state.players;
  // Put some cards in public areas so the counts have something to show.
  alice.zones[3] = [[alice.deck.shift()!]];
  alice.discard.push(alice.deck.shift()!);
  alice.strategyZones[0].push({ card: alice.deck.shift()!, placedOnTurn: 1 });
  return state;
}

const idsOf = (cards: { cardId: number }[]) => cards.map((c) => c.cardId);

describe("getPlayerView (spec: hidden information)", () => {
  it("4.9.2 a player sees their own hand but only the size of the opponent's", () => {
    const state = createGame(testGameOptions());
    const view = getPlayerView(state, "alice");
    expect(view.players[0].hand).toEqual({
      count: 5,
      cards: state.players[0].hand,
    });
    expect(view.players[1].hand).toEqual({ count: 5, cards: null });
  });

  it("4.6.2 a player sees their own monster deck but only the size of the opponent's", () => {
    const state = createGame(testGameOptions());
    const view = getPlayerView(state, "bob");
    expect(view.players[1].monsterDeck).toEqual({
      count: 3,
      cards: state.players[1].monsterDeck,
    });
    expect(view.players[0].monsterDeck).toEqual({ count: 3, cards: null });
  });

  it("4.8.2 nobody sees deck contents or order, not even the owner", () => {
    const state = createGame(testGameOptions());
    for (const viewer of ["alice", "bob", "spectator"]) {
      const view = getPlayerView(state, viewer);
      expect(view.players.map((p) => p.deck)).toEqual([
        { count: 45, cards: null },
        { count: 45, cards: null },
      ]);
    }
  });

  it("4.9.2, 4.6.2 a spectator sees neither hand nor monster deck of either player", () => {
    const view = getPlayerView(createGame(testGameOptions()), "spectator");
    for (const player of view.players) {
      expect(player.hand).toEqual({ count: 5, cards: null });
      expect(player.monsterDeck).toEqual({ count: 3, cards: null });
    }
  });

  it("4.1.2.2 every viewer sees the card count of every area", () => {
    const state = stateWithPublicCards();
    for (const viewer of ["alice", "bob", "spectator"]) {
      const alice = getPlayerView(state, viewer).players[0];
      expect(ZONE_NUMBERS.map((z) => alice.zones[z].count)).toEqual([
        0, 0, 1, 0, 0, 0, 0, 0,
      ]);
      expect(alice.strategyZones.map((z) => z.count)).toEqual([1, 0]);
      expect(alice.monsterDeck.count).toBe(3);
      expect(alice.invadingMonsterZone.count).toBe(1);
      expect(alice.deck.count).toBe(42);
      expect(alice.hand.count).toBe(5);
      expect(alice.discard.count).toBe(1);
      expect(getPlayerView(state, viewer).resolutionArea.count).toBe(0);
    }
  });

  it("4.4.7, 4.5.3, 4.7.3, 4.10.2 zones, strategy zones, the invading monster and the discard pile are public", () => {
    const state = stateWithPublicCards();
    const alice = getPlayerView(state, "bob").players[0];
    expect(alice.zones[3].cards).toEqual(state.players[0].zones[3]);
    expect(alice.strategyZones[0].cards).toEqual(
      state.players[0].strategyZones[0],
    );
    expect(alice.invadingMonsterZone.cards).toEqual(
      state.players[0].invadingMonsterZone,
    );
    expect(alice.monsterPosition).toBe(1);
    expect(alice.discard.cards).toEqual(state.players[0].discard);
  });

  it("4.9.2 card data for hidden cards is not sent: the catalog holds only visible cards", () => {
    const state = createGame(testGameOptions());
    const view = getPlayerView(state, "alice");
    const [alice, bob] = state.players;
    const visible = new Set([
      ...idsOf(alice.hand),
      ...idsOf(alice.monsterDeck),
      ...idsOf(alice.invadingMonsterZone),
      ...idsOf(bob.invadingMonsterZone),
    ]);
    expect(new Set(Object.keys(view.cards).map(Number))).toEqual(visible);
    for (const hiddenCard of [
      ...bob.hand,
      ...bob.monsterDeck,
      ...bob.deck,
      ...alice.deck,
    ]) {
      if (!visible.has(hiddenCard.cardId))
        expect(view.cards[hiddenCard.cardId]).toBeUndefined();
    }
  });

  it("6.3.1.3 the view never contains the seed or RNG state", () => {
    const state = createGame(testGameOptions(987654));
    const view = getPlayerView(state, "alice") as unknown as Record<
      string,
      unknown
    >;
    expect(view["seed"]).toBeUndefined();
    expect(view["rngState"]).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(`"rngState"`);
  });

  it("4.9.2 hidden cards' instance ids are not sent either", () => {
    const state = createGame(testGameOptions());
    const json = JSON.stringify(getPlayerView(state, "alice"));
    for (const card of [
      ...state.players[1].hand,
      ...state.players[1].monsterDeck,
      ...state.players[0].deck,
    ]) {
      expect(json).not.toContain(`"${card.instanceId}"`);
    }
  });

  it("Engine: the view is a copy: changing it does not change the game state", () => {
    const state = createGame(testGameOptions());
    const view = getPlayerView(state, "alice");
    view.players[0].hand.cards?.pop();
    view.log.pop();
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.log).toHaveLength(13);
  });

  it("Engine: the setup log goes to every viewer and holds no hidden card ids", () => {
    const state = createGame(testGameOptions());
    const hiddenIds = new Set(
      state.players.flatMap((p) =>
        [...p.deck, ...p.hand, ...p.monsterDeck].map((c) => c.cardId),
      ),
    );
    for (const viewer of ["alice", "bob", "spectator"]) {
      const view = getPlayerView(state, viewer);
      expect(view.log).toEqual(state.log);
      for (const entry of view.log)
        expect(hiddenIds.has(entry.payload["cardId"] as number)).toBe(false);
    }
  });

  it("Engine: rejects an unknown viewer", () => {
    expect(() =>
      getPlayerView(createGame(testGameOptions()), "mallory"),
    ).toThrow(/Unknown viewer/);
  });
});
