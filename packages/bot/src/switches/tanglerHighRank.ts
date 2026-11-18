import { defineSwitch } from "./define";

/** #444: 1 (the default) discards the highest-rank battle card early; 0 off. */
export default defineSwitch({
  name: "tanglerHighRank",
  default: 1,
  group: "tangler",
  option: "highRank",
  what: "The Tangler plan's early discard (stevilkiwina, R-32): at a discard pick with the rank I Godzilla (2002) EBP03-014 on top (its end-phase discard), the highest-rank battle card goes, the card least likely to be playable soon.",
  from: "#444",
  status: "built",
});
