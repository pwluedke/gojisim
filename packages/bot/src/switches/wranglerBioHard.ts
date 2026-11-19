import { defineSwitch } from "./define";

/** `wranglerBioHard` (Nov 15): 1 prunes three Biollante lines; 0 (the default since its check came out worse) leaves them as `wranglerBio`'s arguments. */
export default defineSwitch({
  name: "wranglerBioHard",
  default: 0,
  group: "wrangler",
  option: "bioHard",
  what: "Three of the Biollante rules (`wranglerBio`) become hard limits that neither the search nor a random mistake can override: no strategy card when Biollante's rank III EBP02-027 can reach zone 6 or beyond, unless your counter beats 40,000; no counter on Biollante Rose Form; and no push out of zone 5. This needs `wranglerBio`. Off by default: its check came out worse (40 wins of 160 vs 63 of 160, Nov 15).",
  from: "Nov 15",
  status: "measured",
});
