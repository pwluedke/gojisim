import { defineSwitch } from "./define";

/** Paul's Monster X plan, with `rules` on: 2 (the default) v2 (`mxPlanV2.ts`, Nov 9), 1 v1 (`mxPlan.ts`, Nov 7), 0 off. */
export default defineSwitch({
  name: "mxPlan",
  default: 2,
  group: "search",
  what: "Paul's Monster X plan: 2 is v2 (`mxPlanV2.ts`), 1 is v1 (`mxPlan.ts`), 0 is off.",
  from: "#223, #227",
  status: "kept",
});
