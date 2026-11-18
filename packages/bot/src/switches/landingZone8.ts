import { defineSwitch } from "./define";

/** Card rule 31 (#419, R-46 piece 1): 1 (the default) plays no Landing at a monster in zone 8; 0 off. */
export default defineSwitch({
  name: "landingZone8",
  default: 1,
  group: "cardRules",
  option: "landingZone8",
  what: "Card rule 31: Godzilla Landing EBP01-030 isn't activated while the opponent's monster is already in zone 8, where its push can't move it.",
  from: "#419",
  status: "built",
});
