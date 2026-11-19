import { defineSwitch } from "./define";

/** Card rule 21 (#304): 1 (the default) keeps battle cards off your own monster's path; 0 is off. */
export default defineSwitch({
  name: "ownPath",
  default: 1,
  group: "cardRules",
  option: "ownPath",
  what: "Card rule 21: don't play a battle card into the next two zones your own monster will move into (its advance or invasion would crush the card there) while it can legally be played into an empty zone outside them. [revenge] cards are the exception.",
  from: "#304",
  status: "built",
});
