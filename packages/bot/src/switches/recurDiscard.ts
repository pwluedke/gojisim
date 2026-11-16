import { defineSwitch } from "./define";

/** Card rule 24 (#325, #329): 1 (the default) discards a recurring card first; 0 is off. */
export default defineSwitch({
  name: "recurDiscard",
  default: 1,
  group: "cardRules",
  option: "recurDiscard",
  what: "Card rule 24: paying for an invasion or discarding down, a card that plays itself back from the discard pile goes first.",
  from: "#325, #329",
  status: "built",
});
