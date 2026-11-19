import { defineSwitch } from "./define";

/** #403: 1 (the default): discards by the rage math; 0 off. */
export default defineSwitch({
  name: "tanglerDiscard",
  default: 1,
  group: "tangler",
  option: "discard",
  what: "The Tangler plan's rule 3: when you have a monster that lowers rage (Godzilla (2002) EBP03-015, Godzilla (2003) EPR-020, EBP03-017) and the opponent's rage is above 0, discard first a battle card that would be worth less than 5000 on the board this turn (3.4.5), and take a rage gain that discards one before ending the turn. This doesn't apply when their rage is 0 (3.4.4). This needs the Tangler plan (`tanglerPlan`).",
  from: "#403",
  status: "built",
});
