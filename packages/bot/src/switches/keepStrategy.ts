import { defineSwitch } from "./define";

/** Card rule 27 (#353): 1 (the default) keeps a strategy over an out-of-reach battle card. */
export default defineSwitch({
  name: "keepStrategy",
  default: 1,
  group: "cardRules",
  option: "keepStrategy",
  what: "Card rule 27: when you discard from your hand (5.7.1, 5.7.2), don't discard a strategy card while you could discard a battle card that you can't play this turn or next turn (its rank is more than 2 above the zone of the opponent's monster).",
  from: "#353",
  status: "built",
});
