import { defineSwitch } from "./define";

/** #406: 1 (the default) carries rank III's rage to the rank IV as cards in hand; 0 off. */
export default defineSwitch({
  name: "festRankThreeSave",
  default: 1,
  group: "fest",
  option: "rankThreeSave",
  what: "The Red Fest plan's rank III save: at rank III, when the opponent can counter you (your monster is in zone 6 or beyond and their counter power is at least your monster's threat), keep your monster cards in hand to discard for rage on the rank IV turn instead of discarding them this turn, and play the battle cards and strategy cards that do nothing now before ending the turn, to make room for the end-of-turn draw. This needs the Red Fest plan (`festPlan`), which is off by default.",
  from: "#406",
  status: "built",
});
