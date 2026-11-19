import { defineSwitch } from "./define";

/** Card rule 23 (#345): 1 (the default) keeps plays off your own battle cards; 0 is off. */
export default defineSwitch({
  name: "ownCover",
  default: 1,
  group: "cardRules",
  option: "ownCover",
  what: "Card rule 23: don't play a battle card on top of one of your own battle cards while it can legally be played into an empty zone outside the next two zones your monster will move into.",
  from: "#345, #342",
  status: "built",
});
