import { defineSwitch } from "./define";

/** #419: 1 (the default) never plays a push strategy that leaves their monster where it is; 0 off. */
export default defineSwitch({
  name: "wranglerDeadPush",
  default: 1,
  group: "wrangler",
  option: "deadPush",
  what: "The Wrangler plan's dead push (Ian): a push strategy (Godzilla Landing, The Slithering Disaster) that leaves the opponent's monster where it is (already in zone 8) is argued against, a spare copy in hand or not (card rule 22b, off by default, would let a spare go as hand cycling); Paul's Landing rule for every deck is card rule 31 (`landingRule`). Needs `wranglerPlan` 2.",
  from: "#419",
  status: "built",
});
