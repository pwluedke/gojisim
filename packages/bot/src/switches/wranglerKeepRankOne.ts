import { defineSwitch } from "./define";

/** #428: 1 (the default) keeps the rank I Godzilla (1954) while it's a needed rage source; 0 off. */
export default defineSwitch({
  name: "wranglerKeepRankOne",
  default: 1,
  group: "wrangler",
  option: "keepRankOne",
  what: "The Wrangler plan's keep the rank I (Ian): with a King to protect (in play or in hand) and the rage short of 3, no monster play over the rank I Godzilla (1954) EBP01-001 (a burst covers it through this turn's counter phase, and its mill of a monster card is a rage), unless it wins now. Needs `wranglerPlan` 2.",
  from: "#428",
  status: "built",
});
