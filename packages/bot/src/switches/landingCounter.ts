import { defineSwitch } from "./define";

/** Card rule 32 (#419, R-46 piece 2): 1 (the default) plays Landing only for this turn's counter; 0 off. */
export default defineSwitch({
  name: "landingCounter",
  default: 1,
  group: "cardRules",
  option: "landingCounter",
  what: "Card rule 32: Godzilla Landing EBP01-030 is activated only when a counter is made this turn after it (made by it, or one battle card play away).",
  from: "#419",
  status: "built",
});
