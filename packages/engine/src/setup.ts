import type { Card } from "@gojisim/cards";
import { normalizeSeed, randomInt, shuffleInPlace } from "./rng";
import { appendLog, drawCards, moved, newInstance } from "./state";
import type {
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  ZoneNumber,
} from "./types";

export interface PlayerSetup {
  id: PlayerId;
  /** Deck validation is out of scope here (M8); the decks are used as given. */
  monsterDeck: Card[];
  mainDeck: Card[];
}

export interface CreateGameOptions {
  seed: number | string;
  players: [PlayerSetup, PlayerSetup];
}

export const STARTING_HAND_SIZE = 5;
export const STARTING_ZONE: ZoneNumber = 1;

function emptyPlayer(id: PlayerId): PlayerState {
  return {
    id,
    zones: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
    strategyZones: [[], []],
    monsterDeck: [],
    invadingMonsterZone: [],
    monsterPosition: null,
    deck: [],
    hand: [],
    discard: [],
    rage: 0,
  };
}

/** Creates a game and runs setup steps 6.3.1.1 to 6.3.1.7 in order, logging each step. */
export function createGame(options: CreateGameOptions): GameState {
  const [a, b] = options.players;
  if (options.players.length !== 2 || a.id === b.id) {
    throw new Error(
      "createGame needs exactly 2 players with different ids (1.1.1)",
    );
  }

  const cards: Record<string, Card> = {};
  for (const card of options.players.flatMap((p) => [
    ...p.monsterDeck,
    ...p.mainDeck,
  ])) {
    const known = cards[card.id];
    if (known && JSON.stringify(known) !== JSON.stringify(card)) {
      throw new Error(`Two different cards share id ${card.id}`);
    }
    cards[card.id] = card;
  }

  const seed = normalizeSeed(options.seed);
  const state: GameState = {
    version: 1,
    seed,
    rngState: seed,
    nextInstanceId: 1,
    nextTimestamp: 1,
    players: [emptyPlayer(a.id), emptyPlayer(b.id)],
    resolutionArea: [],
    firstPlayer: a.id,
    turn: 1,
    turnPlayer: a.id,
    phase: "start",
    step: "7.2.1",
    turnFlags: { invasionUsed: false, monsterPlayed: false },
    standby: [],
    continuousEffects: [],
    result: null,
    cards,
    log: [],
  };
  const setups = new Map(options.players.map((p) => [p.id, p]));
  const setupOf = (player: PlayerState) => setups.get(player.id) as PlayerSetup;

  // 6.3.1.1 Present decks. Validation happens before createGame (M8).
  for (const player of state.players) {
    const { monsterDeck, mainDeck } = setupOf(player);
    appendLog(state, "presentDecks", player.id, {
      rule: "6.3.1.1",
      monsterDeck: monsterDeck.length,
      mainDeck: mainDeck.length,
    });
  }

  // 6.3.1.2 Monster deck into the monster deck zone.
  for (const player of state.players) {
    player.monsterDeck = setupOf(player).monsterDeck.map((c) =>
      newInstance(state, c.id, player.id),
    );
    appendLog(state, "placeMonsterDeck", player.id, {
      rule: "6.3.1.2",
      count: player.monsterDeck.length,
    });
  }

  // 6.3.1.3 Shuffle the main deck into the deck area.
  for (const player of state.players) {
    player.deck = setupOf(player).mainDeck.map((c) =>
      newInstance(state, c.id, player.id),
    );
    shuffleInPlace(state, player.deck);
    appendLog(state, "shuffleDeck", player.id, {
      rule: "6.3.1.3",
      count: player.deck.length,
    });
  }

  // 6.3.1.4 Random first player.
  const first = state.players[randomInt(state, 2)] as PlayerState;
  state.firstPlayer = first.id;
  state.turnPlayer = first.id;
  appendLog(state, "chooseFirstPlayer", first.id, { rule: "6.3.1.4" });

  // 6.3.1.5 Draw the top 5 cards.
  for (const player of state.players) {
    const count = drawCards(state, player, STARTING_HAND_SIZE);
    appendLog(state, "draw", player.id, { rule: "6.3.1.5", count });
  }

  // 6.3.1.6 The rank I monster becomes the invading monster in zone 1 (6.3.1.6.1).
  for (const player of state.players) {
    const index = player.monsterDeck.findIndex((c) => {
      const card = state.cards[c.cardId];
      return card?.type === "Monster" && card.rank === 1;
    });
    if (index < 0)
      throw new Error(
        `Player ${player.id} has no rank I monster card (6.3.1.6)`,
      );
    const [rankOne] = player.monsterDeck.splice(index, 1) as [CardInstance];
    const monster = moved(state, rankOne);
    player.invadingMonsterZone = [monster];
    player.monsterPosition = STARTING_ZONE;
    appendLog(state, "setInvadingMonster", player.id, {
      rule: "6.3.1.6",
      instanceId: monster.instanceId,
      cardId: monster.cardId,
      zone: STARTING_ZONE,
    });
  }

  // 6.3.1.7 Rage 0.
  for (const player of state.players) {
    player.rage = 0;
    appendLog(state, "setRage", player.id, { rule: "6.3.1.7", rage: 0 });
  }

  return state;
}
