import { defineSwitch } from "./define";

/** #497 fix 2 (extends #397): 1 (the default) pays the Flying Form's Crystal discard with a monster card first, never God of Destruction; 0 off. */
export default defineSwitch({
  name: "spacegCrystalCost",
  default: 1,
  group: "spaceg",
  option: "crystalCost",
  what: "The SpaceG plan's rule 7: when SpaceGodzilla Flying Form EBP02-052 discards a card to make a Crystal, discard a monster card while you have one, and never God of Destruction's Counterattack EBP02-072.",
  from: "#497",
  status: "built",
});
