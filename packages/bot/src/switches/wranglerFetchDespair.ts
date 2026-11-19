import { defineSwitch } from "./define";

/** #442: 1 (the default) fetches for Despair's 2 rage before playing it; 0 off. */
export default defineSwitch({
  name: "wranglerFetchDespair",
  default: 1,
  group: "wrangler",
  option: "fetchDespair",
  what: "The Wrangler plan's Despair rage rule: with Godzilla (2023) ESD01-002 on top of your monster and less than 2 rage, first make an invasion whose fetches (the monster cards it brings to your hand) raise the rage to 2, when one of the opponent's battle cards is at or before your monster's zone for Despair to hit. Playing Despair now (it does nothing below 2 rage), tagging out and ending the turn all wait. Without that line, version 2.2's dig (playing cards out to draw more) may still play Despair. This needs version 2 of the Wrangler plan (`wranglerPlan` set to 2).",
  from: "#442",
  status: "built",
});
