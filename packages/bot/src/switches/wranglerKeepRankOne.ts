import { defineSwitch } from "./define";

/** #428: 1 (the default) keeps the rank I Godzilla (1954) while it's a needed rage source; 0 off. */
export default defineSwitch({
  name: "wranglerKeepRankOne",
  default: 1,
  group: "wrangler",
  option: "keepRankOne",
  what: "The Wrangler plan's keep-the-rank-I rule: when you have a Godzilla, King of the Monsters to protect (in play or in hand) and less than 3 rage, don't play a monster card over the rank I Godzilla (1954) EBP01-001, unless the play wins now. Its mill of a monster card in the counter phase adds a rage, and a Burst card played over it covers it through this turn's counter phase. This needs version 2 of the Wrangler plan (`wranglerPlan` set to 2).",
  from: "#428",
  status: "built",
});
