import { defineSwitch } from "./define";

/** The Wrangler plan: 2 (the default) is v2 (`wranglerPlanV2.ts`, Paul, Nov 13) with the card rules (Medium and Hard); 1 is v1 (`wranglerPlan.ts`, #276) with `rules` (Hard); 0 is off. */
export default defineSwitch({
  name: "wranglerPlan",
  default: 2,
  group: "search",
  what: "The Wrangler plan: 2 is v2 (`wranglerPlanV2.ts`, with the card rules), 1 is v1 (`wranglerPlan.ts`, with `rules`), 0 is off.",
  from: "#276, #311",
  status: "kept",
});
