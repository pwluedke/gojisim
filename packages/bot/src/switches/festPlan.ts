import { defineSwitch } from "./define";

/** Slick's Red Fest plan (`festPlan.ts`): 1 applies it, with `rules` on. Off by default: measured Nov 13 it wasn't a gain (paired seeds, the August list and the bots' Red Fest); on for tuning. */
export default defineSwitch({
  name: "festPlan",
  default: 0,
  group: "search",
  what: "Slick's Red Fest plan (`festPlan.ts`), with `rules`. Off by default.",
  from: "#307",
  status: "measured",
});
