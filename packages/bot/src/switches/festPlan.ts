import { defineSwitch } from "./define";

/** The Red Fest plan (`festPlan.ts`): 1 applies it, with `rules` on. Off by default: measured Nov 13 it wasn't a gain (paired seeds, the August list and the bots' Red Fest); on for tuning. */
export default defineSwitch({
  name: "festPlan",
  default: 0,
  group: "search",
  what: "The Red Fest plan (`festPlan.ts`), used together with the play rules (`rules`). It is off by default.",
  from: "#307",
  status: "measured",
});
