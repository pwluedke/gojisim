import {
  counterPowerOf,
  type GameState,
  getCounterPower,
  getPlayerView,
  getThreat,
  type PlayerView,
  ZONE_NUMBERS,
} from "@gojisim/engine";
import type { SeatConfig } from "../game/bots";
import type { PlayerId } from "../game/session";

/**
 * Who sits at the bottom of the board (M5a): the human seat against a bot; in hotseat, the
 * player who must decide now (the board flips when that changes); with two bots, P1.
 */
export function bottomPlayer(
  state: GameState,
  seats: Record<PlayerId, SeatConfig>,
): PlayerId {
  const humans = (["P1", "P2"] as const).filter(
    (id) => seats[id].kind === "human",
  );
  if (humans.length === 1) return humans[0] as PlayerId;
  if (humans.length === 2)
    return (state.pendingChoice?.player ?? state.turnPlayer) as PlayerId;
  return "P1";
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
}

export function boardModel(state: GameState, bottom: PlayerId): BoardModel {
  const view = getPlayerView(state, bottom);
  const counterPower: Record<string, number> = {};
  const threat: Record<string, number> = {};
  const totalCounterPower: Record<string, number> = {};
  for (const player of state.players) {
    for (const zone of ZONE_NUMBERS)
      for (const stack of player.zones[zone]) {
        const top = stack[stack.length - 1];
        if (top) counterPower[top.instanceId] = getCounterPower(state, top);
      }
    threat[player.id] = getThreat(state, player.id);
    totalCounterPower[player.id] = counterPowerOf(state, player);
  }
  return {
    bottom,
    top: bottom === "P1" ? "P2" : "P1",
    view,
    counterPower,
    threat,
    totalCounterPower,
  };
}
