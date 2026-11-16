import { defineSwitch } from "./define";

/** #381: 1 (the default) takes an invade, push and counter line over raging; 0 off. */
export default defineSwitch({
  name: "wranglerPushLine",
  default: 1,
  group: "wrangler",
  option: "pushLine",
  what: "The Wrangler plan's push line (Ian): an invasion that reaches a push strategy's zone (The Slithering Disaster, Godzilla Landing), after which the push and up to 3 battle card plays make the counter this turn, is taken over raging or passing; a push's follow-up counts a counter made by up to 3 plays. Needs `wranglerPlan` 2.",
  from: "#381",
  status: "built",
});
