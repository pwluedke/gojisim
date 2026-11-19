import { defineSwitch } from "./define";

/** Card rule 20 (#324, #327): 1 (the default) takes the counter without a block too; 0 is off. */
export default defineSwitch({
  name: "counterAlways",
  default: 1,
  group: "cardRules",
  option: "counterAlways",
  what: "Card rule 20: wherever the opponent's monster is, and when card rule 7 doesn't apply, take a play that gives you enough counter power to counter the opponent's monster this turn. Once you have that counter power, leave out any play that would lose it.",
  from: "#324, #327",
  status: "built",
});
