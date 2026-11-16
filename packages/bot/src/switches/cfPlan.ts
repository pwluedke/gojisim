import { defineSwitch } from "./define";

/** Paul's Constructed Future plan (`cfPlan.ts`), with `rules` on: 1 (the default) on, 0 off. */
export default defineSwitch({
  name: "cfPlan",
  default: 1,
  group: "search",
  what: "Paul's Constructed Future plan (`cfPlan.ts`), with `rules`.",
  from: "Paul",
  status: "kept",
});
