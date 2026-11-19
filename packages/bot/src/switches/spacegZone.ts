import { defineSwitch } from "./define";

/** #408: 1 (the default) ends SpaceG's turn in zone 7 unless it survives in zone 8; 0 off. */
export default defineSwitch({
  name: "spacegZone",
  default: 1,
  group: "spaceg",
  option: "zone",
  what: "The SpaceGodzilla plan's positioning rule (Nov 16): aim to end the turn in zone 7, counting the one-zone advance at the end of the turn. An invasion that would leave your monster in zone 8 at the end of the turn waits, while one that leaves it in zone 7 or earlier can be made, unless SpaceGodzilla survives the opponent's next counter there: their board's counter power plus their best battle cards in hand up to rank 8 (one for each of their empty zones; the discard pile doesn't count) stays below SpaceGodzilla's threat. This needs the SpaceGodzilla plan (`spacegPlan`).",
  from: "#408",
  status: "built",
});
