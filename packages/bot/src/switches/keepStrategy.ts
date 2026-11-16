import { defineSwitch } from "./define";

/** Card rule 27 (#353): 1 (the default) keeps a strategy over an out-of-reach battle card. */
export default defineSwitch({
  name: "keepStrategy",
  default: 1,
  group: "cardRules",
  option: "keepStrategy",
  what: "Card rule 27: discarding from your hand (5.7.1, 5.7.2), a strategy card isn't the one to go while a battle card you can't play this turn or next (rank above the opponent's monster's zone plus 2) is offered.",
  from: "#353",
  status: "built",
});
