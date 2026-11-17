import { defineSwitch } from "./define";

/** #439, #440: 1 (the default) discards the cheap card of least worth first; 0 off. */
export default defineSwitch({
  name: "tanglerWorth",
  default: 1,
  group: "tangler",
  option: "worth",
  what: "The Tangler plan's discard tiebreaks (BFW182): of the cheap battle cards at a discard pick the least worth goes first; a playable card that draws and discards counts each of its discards' rage drop (Orga about 7000, while the counter still needs numbers); one its rank keeps out of play now counts 0 (a Perfect Form needing their monster in zone 8); with the counter made, the Destoroyah cards stay and the rest may go. Needs `tanglerDiscard`.",
  from: "#439",
  status: "built",
});
