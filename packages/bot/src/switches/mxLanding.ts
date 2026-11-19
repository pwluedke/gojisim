import { defineSwitch } from "./define";

/** The Monster X plan's #335 (no idle Landing): 1 (the default) on; 0 is the old rule 9. */
export default defineSwitch({
  name: "mxLanding",
  default: 1,
  group: "mxPlan",
  option: "landing",
  what: "The Monster X plan's rule from #335: don't play Godzilla Landing when the opponent's monster is already in zone 8, or when you already have enough counter power to counter the opponent's monster without it.",
  from: "#335",
  status: "built",
});
