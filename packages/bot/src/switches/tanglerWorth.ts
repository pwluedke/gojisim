import { defineSwitch } from "./define";

/** #439, #440: 1 (the default) discards the cheap card of least worth first; 0 off. */
export default defineSwitch({
  name: "tanglerWorth",
  default: 1,
  group: "tangler",
  option: "worth",
  what: "The Tangler plan's discard tiebreaks: at a discard pick, of the cheap battle cards the one worth least goes first. Between cheap cards of the same worth, one that doesn't draw and discard when played goes first (Orga's own discard only breaks ties; it isn't held back), while you still need counter power. A card whose rank keeps it out of play now counts as worth nothing (a Perfect Form that needs their monster in zone 8). Once you have enough counter power to counter, the Destoroyah cards stay and the rest may go. Needs `tanglerDiscard`.",
  from: "#439",
  status: "built",
});
