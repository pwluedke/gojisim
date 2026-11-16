import { defineSwitch } from "./define";

/** Card rule 22 (#336): 1 (the default) leaves out destroy-only strategies with no target; 0 off. */
export default defineSwitch({
  name: "targetCheck",
  default: 1,
  group: "cardRules",
  option: "targetCheck",
  what: "Card rule 22: a strategy whose effects only destroy the opponent's battle cards isn't activated when no answer to its choices destroys one.",
  from: "#336",
  status: "built",
});
