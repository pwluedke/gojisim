import { defineSwitch } from "./define";

/** The Red Fest plan's rank I line (#400, Slick): 1 (the default) on with `festPlan`; 0 off. */
export default defineSwitch({
  name: "festRankOne",
  default: 1,
  group: "fest",
  option: "rankOne",
  what: "The Red Fest plan's rank I line (Slick): the rank I Fest EBP01-011 invades only to line up its same-column push with a counter to follow this turn (up to 3 battle card plays); no other rank I invasion. Needs `festPlan` (off by default).",
  from: "#400",
  status: "built",
});
