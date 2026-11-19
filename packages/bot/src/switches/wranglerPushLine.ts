import { defineSwitch } from "./define";

/** #381: 1 (the default) takes an invade, push and counter line over raging; 0 off. */
export default defineSwitch({
  name: "wranglerPushLine",
  default: 1,
  group: "wrangler",
  option: "pushLine",
  what: "The Wrangler plan's push line: a push strategy card (The Slithering Disaster, Godzilla Landing) moves the opponent's monster forward. Take an invasion that reaches the zone a push strategy card needs over discarding for rage or ending the turn, when after it the push and up to 3 battle card plays give you enough counter power to counter the opponent's monster this turn. A push's follow-up counts a counter made by up to 3 plays. This needs version 2 of the Wrangler plan (`wranglerPlan` set to 2).",
  from: "#381",
  status: "built",
});
