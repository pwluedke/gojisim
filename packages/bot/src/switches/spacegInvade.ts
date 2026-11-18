import { defineSwitch } from "./define";

/**
 * #408: 1 invades every turn at ranks 1, 2 and 4; 0 (the default since Nov 18) off. One rule at
 * a time against Despangler, 27 games each: off 11 wins vs the plan's 4 (the plan off: 12).
 */
export default defineSwitch({
  name: "spacegInvade",
  default: 0,
  defaultNote: "0 (measured worse against Despangler, Nov 18)",
  group: "spaceg",
  option: "invade",
  what: "The SpaceG plan's rule 1 (Paul): at ranks 1 and 2 (SpaceGodzilla Flying Form EBP02-052, SpaceGodzilla EBP02-053, whose [invading] makes Crystals) and at rank 4, no passing while an invasion can be made. Needs `spacegPlan`.",
  from: "#408",
  status: "measured",
});
