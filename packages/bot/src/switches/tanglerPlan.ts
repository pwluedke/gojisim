import { defineSwitch } from "./define";

/** #403: 1 (the default) applies BFW182's Tangler plan, with `rules` on; 0 off. */
export default defineSwitch({
  name: "tanglerPlan",
  default: 1,
  group: "search",
  what: "BFW182's Tangler plan (`tanglerPlan.ts`), with `rules`: Entangling Fear every turn, spares kept, the low evolution cards early, discards by the rage math, and the hand kept once the counter is made.",
  from: "#403",
  status: "built",
});
