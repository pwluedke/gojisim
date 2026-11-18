import { defineSwitch } from "./define";

/** #403: 1 (the default): discards by the rage math; 0 off. */
export default defineSwitch({
  name: "tanglerDiscard",
  default: 1,
  group: "tangler",
  option: "discard",
  what: "The Tangler plan's rule 3 (BFW182): with a rage-lowering monster (Godzilla (2002) EBP03-015, Godzilla (2003) EPR-020, EBP03-017) and the opponent's rage above 0, a battle card worth less than 5000 on the board this turn (3.4.5) is the discard picked first, and a rage gain that discards one goes before passing; off at their rage 0 (3.4.4). Needs `tanglerPlan`.",
  from: "#403",
  status: "built",
});
