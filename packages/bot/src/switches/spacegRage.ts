import { defineSwitch } from "./define";

/** #408: 1 (the default): rage at rank 3 and with the rank 4 Flying Form; 0 off. */
export default defineSwitch({
  name: "spacegRage",
  default: 1,
  group: "spaceg",
  option: "rage",
  what: "The SpaceGodzilla plan's rule 2: at rank 3 (SpaceGodzilla EBP02-054, where each rage discard destroys one of the opponent's battle cards of rank 5 or lower for each Crystals token) when you have Crystals and a target, and with the rank 4 Flying Form EBP02-057 (where each rage discard makes 2 Crystals), don't end the turn while a monster card can be discarded for rage. This needs the SpaceGodzilla plan (`spacegPlan`).",
  from: "#408",
  status: "built",
});
