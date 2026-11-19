import { defineSwitch } from "./define";

/** #408: 1 (the default) applies the SpaceG plan, with `rules` on; 0 off. */
export default defineSwitch({
  name: "spacegPlan",
  default: 1,
  group: "search",
  what: "The SpaceGodzilla plan (`spacegPlan.ts`), used with the play rules (`rules`): invade every turn at ranks 1, 2 and 4; discard for rage at rank 3 and with the rank 4 Flying Form; and after the invasion, play a rank 3 SpaceGodzilla on top of the rank 3 in play.",
  from: "#408",
  status: "built",
});
