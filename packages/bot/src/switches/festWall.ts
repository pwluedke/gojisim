import { defineSwitch } from "./define";

/** The Red Fest plan's wall-up (#400, Slick): 1 (the default) on with `festPlan`; 0 off. */
export default defineSwitch({
  name: "festWall",
  default: 1,
  group: "fest",
  option: "wall",
  what: "The Red Fest plan's wall-up (Slick): against Monster X, once losing the counter race (2 ranks above their monster, or 1 with its own monster in zones 6-8), below rank IV no invasion but a winning one, Heat Ray ESD01-016 held for the invasion win, the rank IV Godzilla (2023) EBP01-010 not raged away or paid with. Needs `festPlan` (off by default).",
  from: "#400",
  status: "built",
});
