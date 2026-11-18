import { defineSwitch } from "./define";

/** #442: 1 (the default) fetches for Despair's 2 rage before playing it; 0 off. */
export default defineSwitch({
  name: "wranglerFetchDespair",
  default: 1,
  group: "wrangler",
  option: "fetchDespair",
  what: "The Wrangler plan's Despair rage (Ian): with Godzilla (2023) ESD01-002 on top and the rage under 2, an invasion whose fetches (the monster cards in hand after it) bring the rage to 2, with one of their battle cards at or before your zone for Despair, comes first, and Despair now (it would do nothing below 2 rage), tagging out and passing wait; without that line v2.2's dig may still play Despair. Needs `wranglerPlan` 2.",
  from: "#442",
  status: "built",
});
