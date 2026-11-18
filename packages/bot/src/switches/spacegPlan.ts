import { defineSwitch } from "./define";

/** #408: 1 (the default) applies Paul's SpaceG plan, with `rules` on; 0 off. */
export default defineSwitch({
  name: "spacegPlan",
  default: 1,
  group: "search",
  what: "Paul's SpaceG plan (`spacegPlan.ts`), with `rules`: invade every turn at ranks 1, 2 and 4; rage at rank 3 and with the rank 4 Flying Form; cover the rank 3 with a rank 3 after the invasion.",
  from: "#408",
  status: "built",
});
