import { defineSwitch } from "./define";

/** #497 fix 3: 1 (the default) lifts card rule 14's turn 1-2 rage hold for a SpaceG list; 0 keeps it. */
export default defineSwitch({
  name: "spacegEarlyRage",
  default: 1,
  group: "cardRules",
  option: "spacegEarlyRage",
  what: "Card rule 14 (no rage discards on turns 1 and 2 unless they're needed) doesn't apply to a SpaceGodzilla deck: it discards its monster cards for rage from turn 1, as its plan asks (the SpaceG plan's rule 3).",
  from: "#497",
  status: "built",
});
