import { fireTriggers } from "./abilities";
import { freezeShared } from "./freeze";
import { shuffleInPlace } from "./rng";
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

/**
 * Appends an entry to the action log. Every entry is an engine event, so it then goes through the
 * trigger check (10.6.2); abilities that trigger enter standby and are logged as `enterStandby`.
 */
export function appendLog(
  state: GameState,
  type: string,
  player: PlayerId | null,
  payload: Record<string, unknown>,
): LogEntry {
  // Log entries are shared between cloned states (decision 168): frozen under the guard.
  const entry: LogEntry = freezeShared({
    seq: state.log.length + 1,
    type,
    player,
    payload,
  });
  state.log.push(entry);
  for (const ability of fireTriggers(state, entry)) {
    // Not an event itself, so an ability cannot trigger on its own standby entry.
    state.log.push(
      freezeShared({
        seq: state.log.length + 1,
        type: "enterStandby",
        player: ability.master,
        payload: {
          rule: "10.6.2",
          standbyId: ability.standbyId,
          abilityId: ability.abilityId,
          cardId: ability.sourceCardId,
          triggeredBy: entry.seq,
        },
      }),
    );
  }
  return entry;
}

/** Moves a card to its owner's discard pile as a new object (4.1.4, 4.1.7). */
export function toDiscard(state: GameState, card: CardInstance): CardInstance {
  const discarded = moved(state, card);
  getPlayer(state, card.owner).discard.push(discarded);
  return discarded;
}

/**
 * Reshuffle (11.2), an interrupt rule action: the discard pile becomes the deck and is shuffled.
 * With an empty discard pile nothing happens (11.2.4). Returns whether it reshuffled.
 */
export function reshuffle(state: GameState, player: PlayerState): boolean {
  if (player.discard.length === 0) {
    appendLog(state, "reshuffle", player.id, { rule: "11.2.4", count: 0 });
    return false;
  }
  player.deck = player.discard.map((card) => moved(state, card));
  player.discard = [];
  shuffleInPlace(state, player.deck);
  appendLog(state, "reshuffle", player.id, {
    rule: "11.2.3",
    count: player.deck.length,
  });
  return true;
}

/**
 * Draws `count` cards one at a time from the top of the deck (4.8.3, 5.4.2). A draw from an
 * empty deck reshuffles first (11.2); if that fails, the draw does nothing. Returns cards drawn.
 */
export function drawCards(
  state: GameState,
  player: PlayerState,
  count: number,
): number {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (player.deck.length === 0 && !reshuffle(state, player)) continue;
    const top = player.deck.shift() as CardInstance;
    player.hand.push(moved(state, top));
    drawn++;
  }
  return drawn;
}

/**
 * Sets a player's rage, never below 0 (3.4.4), and logs `rageChanged` with `from` and `to`: the
 * event `rageChanged` triggers match, once per change whatever its size. A change to the value it
 * already has is no change (1.3.2.1): it logs `rageUnchanged`, or nothing when `quiet`.
 */
export function setRage(
  state: GameState,
  player: PlayerState,
  value: number,
  rule: string,
  extra: Record<string, unknown> = {},
  quiet = false,
): void {
  const from = player.rage;
  const to = Math.max(0, value);
  player.rage = to;
  if (to === from) {
    if (!quiet)
      appendLog(state, "rageUnchanged", player.id, {
        rule: "1.3.2.1",
        from,
        to,
        ...extra,
      });
    return;
  }
  appendLog(state, "rageChanged", player.id, {
    rule: value < 0 ? "3.4.4" : rule,
    from,
    to,
    ...extra,
  });
}
