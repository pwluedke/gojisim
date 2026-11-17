import { defineSwitch } from "./define";

/** #406: 1 (the default) lets an early invasion fire Godzilla Emerges; 0 off. */
export default defineSwitch({
  name: "festEmerges",
  default: 1,
  group: "fest",
  option: "emerges",
  what: "The Red Fest plan's Godzilla Emerges line (Slick): an exception to line 2 (no invasion before rank IV): an invasion that takes your monster to zone 6 or beyond (Godzilla Emerges ESD01-014 is rank 6, 8.3.1), with it in hand and 2 rage there or to be raged, so it fires this turn for the rank 8 Godzilla (2023) EBP03-041. Needs `festPlan` (off by default).",
  from: "#406",
  status: "built",
});
