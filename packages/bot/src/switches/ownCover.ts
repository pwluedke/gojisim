import { defineSwitch } from "./define";

/** Card rule 23 (#345): 1 (the default) keeps plays off your own battle cards; 0 is off. */
export default defineSwitch({
  name: "ownCover",
  default: 1,
  group: "cardRules",
  option: "ownCover",
  what: "Card rule 23: no battle card on top of your own battle card while it has a legal play into an empty zone off your monster's next two zones.",
  from: "#345, #342",
  status: "built",
});
