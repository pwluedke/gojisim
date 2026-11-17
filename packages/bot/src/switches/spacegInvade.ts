import { defineSwitch } from "./define";

/** #408: 1 (the default): invade every turn at ranks 1, 2 and 4; 0 off. */
export default defineSwitch({
  name: "spacegInvade",
  default: 1,
  group: "spaceg",
  option: "invade",
  what: "The SpaceG plan's rule 1 (Paul): at ranks 1 and 2 (SpaceGodzilla Flying Form EBP02-052, SpaceGodzilla EBP02-053, whose [invading] makes Crystals) and at rank 4, no passing while an invasion can be made. Needs `spacegPlan`.",
  from: "#408",
  status: "built",
});
