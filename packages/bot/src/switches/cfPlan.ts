import { defineSwitch } from "./define";

/** The Constructed Future plan (`cfPlan.ts`), with `rules` on: 1 (the default) on, 0 off. */
export default defineSwitch({
  name: "cfPlan",
  default: 1,
  group: "search",
  what: "The Constructed Future plan (`cfPlan.ts`) is used together with the play rules (`rules`).",
  from: "Nov 5",
  status: "kept",
});
