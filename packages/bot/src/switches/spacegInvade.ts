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
  what: "The SpaceGodzilla plan's rule 1: at ranks 1 and 2 (SpaceGodzilla Flying Form EBP02-052 and SpaceGodzilla EBP02-053, whose [invading] ability makes Crystals) and at rank 4, don't end the turn while an invasion can be made. This needs the SpaceGodzilla plan (`spacegPlan`).",
  from: "#408",
  status: "measured",
});
