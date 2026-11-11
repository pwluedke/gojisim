import { randomInt } from "node:crypto";
import type { SeatId } from "@gojisim/engine";

/**
 * Who makes the First / Second pick in a head to head game (M9a, Paul's call): one player at
 * random, who then picks one of the two face-down cards on the usual pick screen (6.3.1.4). In
 * tournaments players use the first / second player cards, so this may change; it is one
 * function so the rule is easy to swap.
 */
export function firstPicker(random: () => number = () => randomInt(2)): SeatId {
  return random() === 0 ? "P1" : "P2";
}
