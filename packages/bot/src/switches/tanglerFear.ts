import { defineSwitch } from "./define";

/** #403: 1 (the default): Entangling Fear every turn, spares kept; 0 off. */
export default defineSwitch({
  name: "tanglerFear",
  default: 1,
  group: "tangler",
  option: "fear",
  what: "The Tangler plan's rule 1 (#369): play one Entangling Fear EBP04-081 every turn it can be played and none is in force, and don't end the turn before it. Keep the spare copies: while you have fewer than 3 in hand, don't discard them, discard them for rage, or pay a cost with them. This needs the Tangler plan (`tanglerPlan`).",
  from: "#403",
  status: "built",
});
