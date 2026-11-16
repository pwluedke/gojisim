import { defineSwitch } from "./define";

/** Card rule 28 (#326): 1 (the default) keeps the only lower-rank monster card; 0 is off. */
export default defineSwitch({
  name: "keepLowRank",
  default: 1,
  group: "cardRules",
  option: "keepLowRank",
  what: "Card rule 28: discarding from your hand (5.7.1, 5.7.2), your only copy of a lower-rank monster card isn't the one to go while a higher-rank monster card or a spare copy can go; rule 24's recurring card first.",
  from: "#326",
  status: "built",
});
