import { defineSwitch } from "./define";

/** #403: 1 (the default): Entangling Fear every turn, spares kept; 0 off. */
export default defineSwitch({
  name: "tanglerFear",
  default: 1,
  group: "tangler",
  option: "fear",
  what: "The Tangler plan's rule 1 (BFW182, #369): one Entangling Fear EBP04-081 every turn it can be played and none is in force (no passing before it); spare copies kept (none discarded, raged or paid with while fewer than 3 are in hand). Needs `tanglerPlan`.",
  from: "#403",
  status: "built",
});
