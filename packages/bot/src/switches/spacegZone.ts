import { defineSwitch } from "./define";

/** #408: 1 (the default) ends SpaceG's turn in zone 7 unless it survives in zone 8; 0 off. */
export default defineSwitch({
  name: "spacegZone",
  default: 1,
  group: "spaceg",
  option: "zone",
  what: "The SpaceG plan's positioning (Paul, Nov 16): end the turn in zone 7 (the end-of-turn advance adds one zone); an invasion that would end it in zone 8 waits, while one ending it in zone 7 or short of it can be made, unless SpaceG survives their next counter there: their board's counter power plus their best battle cards in hand up to rank 8 (one per empty zone; the discard pile doesn't count) stays below SpaceG's threat. Needs `spacegPlan`.",
  from: "#408",
  status: "built",
});
