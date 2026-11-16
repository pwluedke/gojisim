import { defineSwitch } from "./define";

/** #380: 1 (the default) pushes to set up GAM and keeps it out of reach; 0 off. */
export default defineSwitch({
  name: "wranglerGamSetup",
  default: 1,
  group: "wrangler",
  option: "gamSetup",
  what: "The Wrangler plan's GAM setup (Ian): Godzilla Against Mechagodzilla EBP01-073 goes out of the opponent's reach (not in the same column as their monster's zone or its next one, where Godzilla (2023) EBP01-010's column destroy hits) when one of its zones is; and with GAM in hand but not playable and no counter this turn, a push (Godzilla Landing, The Slithering Disaster) after which GAM can go there is taken over raging or passing; GAM playable there goes down before passing. Needs `wranglerPlan` 2.",
  from: "#380",
  status: "built",
});
