import { defineSwitch } from "./define";

/** #403: 1 (the default): the hand kept once the counter is made; 0 off. */
export default defineSwitch({
  name: "tanglerStop",
  default: 1,
  group: "tangler",
  option: "stop",
  what: "The Tangler plan's rule 5 (BFW182): with the counter made, battle card plays, strategies and rage gains wait (but Entangling Fear and the low evolution cards), so the rest of the hand is kept for later turns. Needs `tanglerPlan`.",
  from: "#403",
  status: "built",
});
