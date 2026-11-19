import { defineSwitch } from "./define";

/** #403: 1 (the default): the low evolution cards early; 0 off. */
export default defineSwitch({
  name: "tanglerBuild",
  default: 1,
  group: "tangler",
  option: "build",
  what: "The Tangler plan's rule 1: play the low evolution cards (rank 4 or lower, with [evolution]) early. Don't end the turn while one can be played, even when you already have enough counter power to counter the opponent's monster. This needs the Tangler plan (`tanglerPlan`).",
  from: "#403",
  status: "built",
});
