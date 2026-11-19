import { defineSwitch } from "./define";

/** The Wrangler plan: 2 (the default) is v2 (`wranglerPlanV2.ts`, Nov 13) with the card rules (Medium and Hard); 1 is v1 (`wranglerPlan.ts`, #276) with `rules` (Hard); 0 is off. */
export default defineSwitch({
  name: "wranglerPlan",
  default: 2,
  group: "search",
  what: "The Wrangler plan: 2 uses version 2 (`wranglerPlanV2.ts`, with the card rules), 1 uses version 1 (`wranglerPlan.ts`, with the play rules `rules`), and 0 turns it off.",
  from: "#276, #311",
  status: "kept",
});
