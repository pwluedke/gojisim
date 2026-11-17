import { defineSwitch } from "./define";

/** #388: 1 (the default) takes an invade, rage reset, rage destroy and counter line; 0 off. */
export default defineSwitch({
  name: "wranglerResetLine",
  default: 1,
  group: "wrangler",
  option: "resetLine",
  what: "The Wrangler plan's reset line (Ian): an invasion that triggers Godzilla Against Mechagodzilla EBP01-073's rage reset (the opponent's rage to 0, so a King's protection is gone), after which a rage gain (Godzilla (2023) EBP01-010's column destroy) and up to 3 battle card plays make the counter this turn, is taken over raging or passing, ahead of v2.1's rage to 3 for a King. Needs `wranglerPlan` 2.",
  from: "#388",
  status: "built",
});
