import { defineSwitch } from "./define";

/** #406: 1 (the default) lets an early invasion fire Godzilla Emerges; 0 off. */
export default defineSwitch({
  name: "festEmerges",
  default: 1,
  group: "fest",
  option: "emerges",
  what: "The Red Fest plan's Godzilla Emerges line, an exception to the plan's line 2 (no invasion before rank IV): make an early invasion that takes your monster to zone 6 or beyond when Godzilla Emerges ESD01-014 is in your hand and you have 2 rage (already, or after this turn's rage discards), so Godzilla Emerges fires this turn for the rank 8 Godzilla (2023) EBP03-041. Godzilla Emerges is rank 6, so it needs your monster in zone 6 or beyond (8.3.1). This needs the Red Fest plan (`festPlan`), which is off by default.",
  from: "#406",
  status: "built",
});
