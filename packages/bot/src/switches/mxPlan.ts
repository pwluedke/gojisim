import { defineSwitch } from "./define";

/** The Monster X plan, with `rules` on: 2 (the default) v2 (`mxPlanV2.ts`, Nov 9), 1 v1 (`mxPlan.ts`, Nov 7), 0 off. */
export default defineSwitch({
  name: "mxPlan",
  default: 2,
  group: "search",
  what: "The Monster X plan: 2 uses version 2 (`mxPlanV2.ts`), 1 uses version 1 (`mxPlan.ts`), and 0 turns it off.",
  from: "#223, #227",
  status: "kept",
});
