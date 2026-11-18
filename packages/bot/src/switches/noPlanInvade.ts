import { defineSwitch } from "./define";

/** #460: 1 (the default): a deck with no plan invades only with a reason; 0 off. */
export default defineSwitch({
  name: "noPlanInvade",
  default: 1,
  group: "search",
  what: "The no-plan play's rule 2 (Ian, R-43): for a deck with no plan of its own, an invasion that doesn't win now waits unless the invading monster has an [invading] ability or the invasion makes the counter (made after it, not before). With `rules`.",
  from: "#460",
  status: "built",
});
