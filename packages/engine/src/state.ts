import type {
  CardInstance,
  GameState,
  LogEntry,
  PlayerId,
  PlayerState,
} from "./types";

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`Unknown player ${id}`);
  return player;
}

export function getOpponent(state: GameState, id: PlayerId): PlayerState {
  const opponent = state.players.find((p) => p.id !== id);
  if (!opponent || !state.players.some((p) => p.id === id)) {
    throw new Error(`Unknown player ${id}`);
  }
  return opponent;
}

/** A card instance with a fresh object identity. */
export function newInstance(
  state: GameState,
  cardId: number,
  owner: PlayerId,
): CardInstance {
  return { instanceId: `c${state.nextInstanceId++}`, cardId, owner };
}

/**
 * The card as it arrives in a new area. A move between areas, other than zone to zone, makes it a
 * new object (4.1.4), so it gets a fresh instance id.
 */
export function moved(
  state: GameState,
  card: CardInstance,
  zoneToZone = false,
): CardInstance {
  return zoneToZone ? card : newInstance(state, card.cardId, card.owner);
}

export function appendLog(
  state: GameState,
  type: string,
  player: PlayerId | null,
  payload: Record<string, unknown>,
): LogEntry {
  const entry: LogEntry = { seq: state.log.length + 1, type, player, payload };
  state.log.push(entry);
  return entry;
}

/** Draws up to `count` cards from the top of the deck, one at a time (4.8.3, 5.4). */
export function drawCards(
  state: GameState,
  player: PlayerState,
  count: number,
): number {
  let drawn = 0;
  // Reshuffling an empty deck (11.2) arrives with rule actions in M3d.
  while (drawn < count && player.deck.length > 0) {
    const top = player.deck.shift() as CardInstance;
    player.hand.push(moved(state, top));
    drawn++;
  }
  return drawn;
}
