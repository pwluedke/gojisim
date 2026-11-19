import { defineSwitch } from "./define";

/** #444 point 3: 1 (the default) plays for the counter against Gigan (2004); 0 off. */
export default defineSwitch({
  name: "tanglerGigan",
  default: 1,
  group: "tangler",
  option: "gigan",
  what: "The Tangler plan's rule 7: when the opponent's monster has Gigan (2004) EBP04-028, whose [opponents-turn] ability gives your strategy cards +3 rank (so Entangling Fear can't be played until your monster is in zone 6), and you can't play Entangling Fear: an invasion that doesn't win waits (don't push toward zone 6 for Entangling Fear), and don't end the turn while a battle card can be played and you don't yet have enough counter power to counter the opponent's monster. This needs the Tangler plan (`tanglerPlan`).",
  from: "#444",
  status: "built",
});
