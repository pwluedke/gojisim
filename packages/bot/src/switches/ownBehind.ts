import { defineSwitch } from "./define";

/** Card rule 25 (#337): 1 (the default) keeps battle cards out of the zone behind; 0 is off. */
export default defineSwitch({
  name: "ownBehind",
  default: 1,
  group: "cardRules",
  option: "ownBehind",
  what: "Card rule 25: with your monster in zone 6, 7 or 8, no battle card into the zone behind it (5, 4 or 3), where a counter moves it back and crushes the card, while an empty zone off its path and not behind it is legal; [revenge] cards excepted.",
  from: "#337",
  status: "built",
});
