import type { GameState } from "@gojisim/engine";
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

// The board model moved to the engine in M9a, so the head to head server builds the same board.
export {
  type BoardModel,
  boardModel,
  type DiscardNeed,
  discardNeeded,
  discardNeededText,
  MECHA_KING_GHIDORAH,
  mechaCheckNeeded,
  mechaCheckText,
} from "@gojisim/engine";
