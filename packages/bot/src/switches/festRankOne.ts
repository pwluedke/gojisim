import { defineSwitch } from "./define";

/** The Red Fest plan's rank I line (#400): 1 (the default) on with `festPlan`; 0 off. */
export default defineSwitch({
  name: "festRankOne",
  default: 1,
  group: "fest",
  option: "rankOne",
  what: "The Red Fest plan's rank I line: the rank I Fest EBP01-011 invades only to line up its same-column push (moving into the column of the opponent's monster pushes that monster forward) when a counter can follow this turn with up to 3 battle card plays. No other invasion is made at rank I. This needs the Red Fest plan (`festPlan`), which is off by default.",
  from: "#400",
  status: "built",
});
