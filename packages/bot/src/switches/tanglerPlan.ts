import { defineSwitch } from "./define";

/** #403: 1 (the default) applies the Tangler plan, with `rules` on; 0 off. */
export default defineSwitch({
  name: "tanglerPlan",
  default: 1,
  group: "search",
  what: "The Tangler plan (`tanglerPlan.ts`), used with the play rules (`rules`): play Entangling Fear every turn and keep the spare copies, play the low evolution cards early, pick discards by how a rage-lowering monster changes their value, and keep the rest of the hand once you have enough counter power to counter the opponent's monster.",
  from: "#403",
  status: "built",
});
