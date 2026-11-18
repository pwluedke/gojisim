import { defineSwitch } from "./define";

/** #444 point 3: 1 (the default) plays for the counter against Gigan (2004); 0 off. */
export default defineSwitch({
  name: "tanglerGigan",
  default: 1,
  group: "tangler",
  option: "gigan",
  what: "The Tangler plan's rule 7 (stevilkiwina): against Gigan (2004) EBP04-028 on their monster, whose [opponents-turn] gives your strategy cards +3 rank (Entangling Fear unplayable until zone 6), with Fear unplayable: an invasion that doesn't win waits (no pushing toward zone 6 for Fear), and no passing while a battle card can be played and the counter isn't made. Needs `tanglerPlan`.",
  from: "#444",
  status: "built",
});
