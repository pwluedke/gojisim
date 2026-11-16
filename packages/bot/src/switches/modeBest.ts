import { defineSwitch } from "./define";

/** Card rule 30 (#386): 1 (the default) picks a destroy-only strategy's strongest mode; 0 off. */
export default defineSwitch({
  name: "modeBest",
  default: 1,
  group: "cardRules",
  option: "modeBest",
  what: "Card rule 30: at a choice in a destroy-only strategy's resolution (Godzilla vs. Megaguirus EBP01-064's mode, then its zone), an answer that can destroy fewer of the opponent's cards than another isn't picked.",
  from: "#386",
  status: "built",
});
