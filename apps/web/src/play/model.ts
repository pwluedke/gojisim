import {
  type CardChange,
  cardChanges,
  counterPowerOf,
  type GameState,
  getCounterPower,
  getPlayerView,
  getRank,
  getThreat,
  type PlayerView,
  ZONE_NUMBERS,
} from "@gojisim/engine";
import type { SeatConfig } from "../game/bots";
import type { PlayerId } from "../game/session";

/**
 * Who sits at the bottom of the board (M5a): the human seat against a bot; with two bots, P1.
 * `/play` has at most one human seat (M5h removed hotseat).
 */
export function bottomPlayer(
  state: GameState,
  seats: Record<PlayerId, SeatConfig>,
): PlayerId {
  const humans = (["P1", "P2"] as const).filter(
    (id) => seats[id].kind === "human",
  );
  return humans.length === 1 ? (humans[0] as PlayerId) : "P1";
}

/** The view with the other player's hand cards face up (and in the view's card catalog). */
function withOpenHand(
  view: PlayerView,
  state: GameState,
  bottom: PlayerId,
): PlayerView {
  const other = state.players.find((p) => p.id !== bottom);
  if (!other) return view;
  const cards = { ...view.cards };
  for (const card of other.hand) {
    const data = state.cards[card.cardId];
    if (data) cards[card.cardId] = data;
  }
  return {
    ...view,
    cards,
    players: view.players.map((p) =>
      p.id === other.id
        ? {
            ...p,
            hand: { ...p.hand, cards: other.hand.map((c) => ({ ...c })) },
          }
        : p,
    ) as PlayerView["players"],
  };
}

/**
 * Everything the board shows, built for the bottom player: their `getPlayerView` (so hidden
 * information never reaches the board) plus public numbers read through the 10.8.1 layers.
 */
export interface BoardModel {
  bottom: PlayerId;
  top: PlayerId;
  view: PlayerView;
  /** Counter power of each battle card on top of a zone stack, by instance id (public). */
  counterPower: Record<string, number>;
  /** Threat of each invading monster (`getThreat`). */
  threat: Record<string, number>;
  /** Each player's total counter power for their next counter phase (7.4.2). */
  totalCounterPower: Record<string, number>;
  /** Each player's invading monster's rank with effects (`getRank`), null without a monster. */
  monsterRank: Record<string, number | null>;
  /**
   * Every change in force on each card on the field (M5d, `cardChanges`), by instance id: zone
   * tops, the invading monster and strategy cards. Cards with none are left out.
   */
  changes: Record<string, CardChange[]>;
  /** "Show opponent's hand" is on (M5h #13): the top player's hand is face up and fans out. */
  openHand: boolean;
}

/**
 * `openHand` (M5h #13, "Show opponent's hand"): the top player's hand shows face up. Only the
 * board sees it; the bot still plays from its own view.
 */
export function boardModel(
  state: GameState,
  bottom: PlayerId,
  openHand = false,
): BoardModel {
  const base = getPlayerView(state, bottom);
  const view = openHand ? withOpenHand(base, state, bottom) : base;
  const counterPower: Record<string, number> = {};
  const threat: Record<string, number> = {};
  const totalCounterPower: Record<string, number> = {};
  const monsterRank: Record<string, number | null> = {};
  const changes: Record<string, CardChange[]> = {};
  const noteChanges = (instanceId: string) => {
    const found = cardChanges(state, instanceId);
    if (found.length > 0) changes[instanceId] = found;
  };
  for (const player of state.players) {
    for (const zone of ZONE_NUMBERS)
      for (const stack of player.zones[zone]) {
        const top = stack[stack.length - 1];
        if (top) {
          counterPower[top.instanceId] = getCounterPower(state, top);
          noteChanges(top.instanceId);
        }
      }
    for (const placements of player.strategyZones)
      for (const { card } of placements) noteChanges(card.instanceId);
    threat[player.id] = getThreat(state, player.id);
    totalCounterPower[player.id] = counterPowerOf(state, player);
    const monster =
      player.invadingMonsterZone[player.invadingMonsterZone.length - 1];
    monsterRank[player.id] = monster ? getRank(state, monster) : null;
    if (monster) noteChanges(monster.instanceId);
  }
  return {
    bottom,
    top: bottom === "P1" ? "P2" : "P1",
    view,
    counterPower,
    threat,
    totalCounterPower,
    monsterRank,
    changes,
    openHand,
  };
}
