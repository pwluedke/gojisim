import { defineSwitch } from "./define";

/** The Red Fest plan's wall-up (#400): 1 (the default) on with `festPlan`; 0 off. */
export default defineSwitch({
  name: "festWall",
  default: 1,
  group: "fest",
  option: "wall",
  what: "The Red Fest plan's wall-up against Monster X: once you are losing the race to counter (your monster is 2 ranks above theirs, or 1 rank above with your monster in zones 6-8), make no invasion below rank IV unless it wins the game, hold Heat Ray ESD01-016 for the invasion that wins, and don't discard the rank IV Godzilla (2023) EBP01-010 for rage or pay a cost with it. This needs the Red Fest plan (`festPlan`), which is off by default.",
  from: "#400",
  status: "built",
});
