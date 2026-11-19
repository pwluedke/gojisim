import { defineSwitch } from "./define";

/** Card rule 30 (#386): 1 (the default) picks a destroy-only strategy's strongest mode; 0 off. */
export default defineSwitch({
  name: "modeBest",
  default: 1,
  group: "cardRules",
  option: "modeBest",
  what: "Card rule 30: when you make a choice while resolving a strategy card that only destroys (such as the mode and then the zone of Godzilla vs. Megaguirus EBP01-064), don't pick an answer that can destroy fewer of the opponent's cards than another answer.",
  from: "#386",
  status: "built",
});
