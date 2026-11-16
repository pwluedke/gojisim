import { defineSwitch } from "./define";

/** `wranglerBioHard` (Paul, Nov 15): 1 prunes three Biollante lines; 0 (the default since its check came out worse) leaves them as `wranglerBio`'s arguments. */
export default defineSwitch({
  name: "wranglerBioHard",
  default: 0,
  group: "wrangler",
  option: "bioHard",
  what: "Three of `wranglerBio`'s lines as prunes (the search and a blunder can't override them): no strategy when Biollante's rank III EBP02-027 can reach zone 6+, unless your counter beats 40,000; no counter on its Rose Form; no push out of zone 5. Needs `wranglerBio`. Off by default: its check was worse (40 / 160 vs 63 / 160, Paul, Nov 15).",
  from: "Paul, Nov 15",
  status: "measured",
});
