import { defineSwitch } from "./define";

/** #403: 1 (the default): the low evolution cards early; 0 off. */
export default defineSwitch({
  name: "tanglerBuild",
  default: 1,
  group: "tangler",
  option: "build",
  what: "The Tangler plan's rule 1 (BFW182): the low evolution cards (rank 4 or lower with [evolution]) come out early: no passing while one can be played, even with the counter made. Needs `tanglerPlan`.",
  from: "#403",
  status: "built",
});
