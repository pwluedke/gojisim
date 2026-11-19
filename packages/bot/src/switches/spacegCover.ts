import { defineSwitch } from "./define";

/** #408: 1 (the default): cover the rank 3 with a rank 3, after the invasion; 0 off. */
export default defineSwitch({
  name: "spacegCover",
  default: 1,
  group: "spaceg",
  option: "cover",
  what: "The SpaceGodzilla plan's rule 3 (with its addendum): before ending the turn, play another rank 3 SpaceGodzilla EBP02-054 from your hand on top of the one in play (for 2 more Crystals), but wait for this turn's invasion while it can still be made (invade first, then play on top, so the Crystals land behind SpaceGodzilla). This needs the SpaceGodzilla plan (`spacegPlan`).",
  from: "#408",
  status: "built",
});
