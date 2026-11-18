import { defineSwitch } from "./define";

/** #408: 1 (the default): cover the rank 3 with a rank 3, after the invasion; 0 off. */
export default defineSwitch({
  name: "spacegCover",
  default: 1,
  group: "spaceg",
  option: "cover",
  what: "The SpaceG plan's rule 3 (Paul and his addendum): another rank 3 SpaceGodzilla EBP02-054 from your hand covers the one in play (2 more Crystals) before passing, and waits for this turn's invasion while it can still be made (invade, then cover, so the Crystals land behind SpaceG). Needs `spacegPlan`.",
  from: "#408",
  status: "built",
});
