import { defineSwitch } from "./define";

/** The Monster X plan's #373: 1 (the default) skips a Fear that blocks next turn's strategy. */
export default defineSwitch({
  name: "mxFearReach",
  default: 1,
  group: "mxPlan",
  option: "fearReach",
  what: "The Monster X plan's rule from #373 (report R-5): don't play Entangling Fear (it holds your monster in place) while a strategy card in your hand needs your monster one zone further forward (for example, Godzilla vs. Megaguirus is rank 5 and your monster is in zone 4) and you already have enough counter power to counter the opponent's monster this turn (8.3.1).",
  from: "#373",
  status: "built",
});
