import { defineSwitch } from "./define";

/** #380: 1 (the default) keeps GAM out of reach and plays it before passing; 0 off. */
export default defineSwitch({
  name: "wranglerGamSetup",
  default: 1,
  group: "wrangler",
  option: "gamSetup",
  what: "The Wrangler plan's GAM setup (Ian): Godzilla Against Mechagodzilla EBP01-073 goes out of the opponent's reach (not in the same column as their monster's zone or its next one, where Godzilla (2023) EBP01-010's column destroy hits) when one of its zones is, and GAM playable there goes down before passing. (Its push to set GAM up was dropped: Paul, Nov 16, card rule 31.) Needs `wranglerPlan` 2.",
  from: "#380",
  status: "built",
});
