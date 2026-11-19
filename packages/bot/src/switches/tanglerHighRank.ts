import { defineSwitch } from "./define";

/** #444: 1 (the default) discards the highest-rank battle card early; 0 off. */
export default defineSwitch({
  name: "tanglerHighRank",
  default: 1,
  group: "tangler",
  option: "highRank",
  what: "The Tangler plan's early discard (report R-32): when you pick a card to discard with the rank I Godzilla (2002) EBP03-014 on top of your monster (its end-phase discard), discard the highest-rank battle card, the card least likely to be playable soon.",
  from: "#444",
  status: "built",
});
