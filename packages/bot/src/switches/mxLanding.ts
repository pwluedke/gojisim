import { defineSwitch } from "./define";

/** The Monster X plan's #335 (no idle Landing): 1 (the default) on; 0 is the old rule 9. */
export default defineSwitch({
  name: "mxLanding",
  default: 1,
  group: "mxPlan",
  option: "landing",
  what: "The Monster X plan's #335: no Landing on a monster already in zone 8, or when the counter is made without it.",
  from: "#335",
  status: "built",
});
