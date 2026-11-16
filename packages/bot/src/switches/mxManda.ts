import { defineSwitch } from "./define";

/** The Monster X plan's #338 (Manda's discount as a setup play): 1 (default) on; 0 old rule 3. */
export default defineSwitch({
  name: "mxManda",
  default: 1,
  group: "mxPlan",
  option: "manda",
  what: "The Monster X plan's #338 (Paul's ruling): Manda (2004) EBP04-045's discount discard only to cheat out the white Monster X EBP03-067 with 2+ colors among your zones' battle cards, or for a color your discard pile's battle cards lack; else full rank or not at all.",
  from: "#338",
  status: "built",
});
