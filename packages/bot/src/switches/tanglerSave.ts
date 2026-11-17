import { defineSwitch } from "./define";

/** #403 rule 6: 1 (the default) holds Destoroyah Perfect Form for the counter that needs it; 0 off. */
export default defineSwitch({
  name: "tanglerSave",
  default: 1,
  group: "tangler",
  option: "save",
  what: "The Tangler plan's rule 6 (BFW182; Monarch, Nov 16): Destoroyah Perfect Form EBP02-037 is held unless it's needed for this turn's counter (it makes the counter, the counter isn't made already, and no other play makes it, Godzilla vs. Destoroyah aside): card rule 5's test, which already holds Godzilla vs. Destoroyah. Perfect Form until BFW182 names the card. Needs `tanglerPlan`.",
  from: "#403",
  status: "built",
});
