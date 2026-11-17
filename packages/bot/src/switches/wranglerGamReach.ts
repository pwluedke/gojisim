import { defineSwitch } from "./define";

/** #424: 1 (the default) never puts GAM where their monster can destroy it next turn; 0 off. */
export default defineSwitch({
  name: "wranglerGamReach",
  default: 1,
  group: "wrangler",
  option: "gamReach",
  what: "The Wrangler plan's GAM reach (Ian): the opponent's reach counts the zone a counter sends their monster back to (5.15.1.1, from zone 6 to 8) and the one after it, as well as its zone and next one; Godzilla Against Mechagodzilla EBP01-073 into a zone in the same column as one of those (4.4.5.4, Godzilla (2023) EBP01-010's column destroy) is pruned while a zone out of reach (any, off your path) is open. Needs `wranglerPlan` 2.",
  from: "#424",
  status: "built",
});
