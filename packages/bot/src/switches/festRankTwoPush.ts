import { defineSwitch } from "./define";

/** #406: 1 (the default) lets the rank II Fest invade for its counter-lining push; 0 off. */
export default defineSwitch({
  name: "festRankTwoPush",
  default: 1,
  group: "fest",
  option: "rankTwoPush",
  what: "The Red Fest plan's rank II push (Slick): an exception to line 2 (no invasion before rank IV): the rank II Fest EBP01-012 invades when its end-phase push (it advances their monster a zone on a turn it invaded) takes their monster to zone 6 or beyond, lining up the counter next turn. Needs `festPlan` (off by default).",
  from: "#406",
  status: "built",
});
