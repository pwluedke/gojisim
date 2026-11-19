import { defineSwitch } from "./define";

/** Card rule 24 (#325, #329): 1 (the default) discards a recurring card first; 0 is off. */
export default defineSwitch({
  name: "recurDiscard",
  default: 1,
  group: "cardRules",
  option: "recurDiscard",
  what: "Card rule 24: when you pay for an invasion or discard down to your hand size, discard first a card that plays itself back from the discard pile.",
  from: "#325, #329",
  status: "built",
});
