import { defineSwitch } from "./define";

/** #388: 1 (the default) takes an invade, rage reset, rage destroy and counter line; 0 off. */
export default defineSwitch({
  name: "wranglerResetLine",
  default: 1,
  group: "wrangler",
  option: "resetLine",
  what: "The Wrangler plan's reset line: take an invasion that triggers Godzilla Against Mechagodzilla EBP01-073's rage reset (it sets the opponent's rage to 0, so their Godzilla, King of the Monsters loses its protection) over discarding for rage or ending the turn, when after it a rage gain (Godzilla (2023) EBP01-010's column destroy) and up to 3 battle card plays give you enough counter power to counter the opponent's monster this turn. This goes ahead of version 2.1's rule to raise rage to 3 to protect a Godzilla, King of the Monsters. This needs version 2 of the Wrangler plan (`wranglerPlan` set to 2).",
  from: "#388",
  status: "built",
});
