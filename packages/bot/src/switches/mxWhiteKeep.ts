import { defineSwitch } from "./define";

/** The Monster X plan's #370: 1 (the default) keeps the white Monster X unless it fires; 0 off. */
export default defineSwitch({
  name: "mxWhiteKeep",
  default: 1,
  group: "mxPlan",
  option: "whiteKeep",
  what: "The Monster X plan's rule from #370 (report R-3): discard the white Monster X EBP03-067 for Manda (2004)'s discount only when the battle cards in your zones have 2 or more colors (so its ability fires) or when it gives you this turn's counter, never just to add a new color to your discard pile. Measured: about even (64 vs 65 wins of 108 games), and its mistakes fell from 5 to 2, so it ships on (Nov 15).",
  from: "#370",
  status: "measured",
});
