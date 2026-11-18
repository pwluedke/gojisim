import { defineSwitch } from "./define";

/** #406: 1 (the default) carries rank III's rage to the rank IV as cards in hand; 0 off. */
export default defineSwitch({
  name: "festRankThreeSave",
  default: 1,
  group: "fest",
  option: "rankThreeSave",
  what: "The Red Fest plan's rank III save (Slick): at rank III in reach of their counter (your monster in zone 6 or beyond, their counter power at least your threat), the rage goes to the rank IV turn as monster cards kept in hand (no rage discards this turn), and the battle cards and strategies that do nothing now are played out before passing, to make room for the end-of-turn draw. Needs `festPlan` (off by default).",
  from: "#406",
  status: "built",
});
