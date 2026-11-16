import { defineSwitch } from "./define";

/** Card rule 20 (#324, #327): 1 (the default) takes the counter without a block too; 0 is off. */
export default defineSwitch({
  name: "counterAlways",
  default: 1,
  group: "cardRules",
  option: "counterAlways",
  what: "Card rule 20: wherever the opponent's monster is and with rule 7 not involved, a way to make the counter this turn is taken; with the counter made, a play that drops it is left out.",
  from: "#324, #327",
  status: "built",
});
