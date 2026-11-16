import { defineSwitch } from "./define";

/** The Monster X plan's #373: 1 (the default) skips a Fear that blocks next turn's strategy. */
export default defineSwitch({
  name: "mxFearReach",
  default: 1,
  group: "mxPlan",
  option: "fearReach",
  what: "The Monster X plan's #373 (Paul's R-5): no Entangling Fear (which holds your monster in place) while a strategy in hand is one rank past your monster's zone (8.3.1, e.g. Godzilla vs. Megaguirus at rank 5 from zone 4) and this turn's counter is made.",
  from: "#373",
  status: "built",
});
