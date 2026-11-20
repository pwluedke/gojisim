import { defineSwitch } from "./define";

/** Card rule 33 (#419): 1 (the default) leaves out a Godzilla Landing that can't move their monster; 0 off. */
export default defineSwitch({
  name: "landingZone8",
  default: 1,
  group: "cardRules",
  option: "landingZone8",
  what: "Card rule 33: don't activate Godzilla Landing EBP01-030 while the opponent's monster is already in zone 8, where its push can't move it.",
  from: "#419",
  status: "built",
});
