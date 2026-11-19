import { defineSwitch } from "./define";

/** Card rule 28 (#326): 1 (the default) keeps the only lower-rank monster card; 0 is off. */
export default defineSwitch({
  name: "keepLowRank",
  default: 1,
  group: "cardRules",
  option: "keepLowRank",
  what: "Card rule 28: when you discard from your hand (5.7.1, 5.7.2), don't discard your only copy of a lower-rank monster card while a higher-rank monster card or a spare copy of a monster card can go instead. A card that plays itself back from the discard pile (card rule 24) goes first.",
  from: "#326",
  status: "built",
});
