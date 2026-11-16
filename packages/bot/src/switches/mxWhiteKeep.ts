import { defineSwitch } from "./define";

/** The Monster X plan's #370: 1 (the default) keeps the white Monster X unless it fires; 0 off. */
export default defineSwitch({
  name: "mxWhiteKeep",
  default: 1,
  group: "mxPlan",
  option: "whiteKeep",
  what: "The Monster X plan's #370 (Paul's R-3): the white Monster X EBP03-067 is Manda (2004)'s discount discard only with 2+ colors among your zones' battle cards (its ability fires) or for this turn's counter, never just for a new discard-pile color. Measured: level (64 vs 65 of 108), its mistakes 5 → 2; ships on (Monarch, Nov 15).",
  from: "#370",
  status: "measured",
});
