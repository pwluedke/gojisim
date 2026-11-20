import { defineSwitch } from "./define";

/** #497 fix 1 (extends #391): 1 (the default) pays an invasion with a monster card when one with the same icons can; 0 off. */
export default defineSwitch({
  name: "spacegMonsterCost",
  default: 1,
  group: "spaceg",
  option: "monsterCost",
  what: "The SpaceG plan's rule 6: pay an invasion with a monster card when one with the same invasion icons can pay it, not with a battle or strategy card, whose value is in your hand. GAM EBP01-073 or another card pays only when no monster card can.",
  from: "#497",
  status: "built",
});
