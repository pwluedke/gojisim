import { defineSwitch } from "./define";

/** Card rule 25 (#337): 1 (the default) keeps battle cards out of the zone behind; 0 is off. */
export default defineSwitch({
  name: "ownBehind",
  default: 1,
  group: "cardRules",
  option: "ownBehind",
  what: "Card rule 25: when your monster is in zone 6, 7 or 8, don't play a battle card into the zone just behind it (zone 5, 4 or 3), where a counter would move your monster back onto the card and crush it, while the card can legally go into an empty zone that is outside your monster's path and not behind it. [revenge] cards are the exception.",
  from: "#337",
  status: "built",
});
