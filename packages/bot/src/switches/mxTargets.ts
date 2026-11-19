import { defineSwitch } from "./define";

/** The Monster X plan's rule 16 (#352): 1 (the default) targets their Monster X first; 0 off. */
export default defineSwitch({
  name: "mxTargets",
  default: 1,
  group: "mxPlan",
  option: "targets",
  what: "The Monster X plan's rule 16: when you choose one of the opponent's zones or battle cards to destroy, pick first one that holds their Monster X (EBP04-047, EBP03-067) or Kaizer Ghidorah EBP04-068.",
  from: "#352",
  status: "built",
});
