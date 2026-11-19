import { defineSwitch } from "./define";

/** #483 (Ian, R-52): 1 (the default) holds rule 6a's Destoroyah only as the last copy left to draw; 0 holds any lone copy in hand. */
export default defineSwitch({
  name: "tanglerSaveLast",
  default: 1,
  group: "tangler",
  option: "saveLast",
  what: "The Tangler plan's rule 6a, the last copy (Ian, #483): the rank 4 or 6 Destoroyah in hand is held only when it's the last copy left to draw (none left in the deck, whose contents you know but not their order); while another copy is still in the deck it's played or discarded like any card. Needs `tanglerSave`.",
  from: "#483",
  status: "built",
});
