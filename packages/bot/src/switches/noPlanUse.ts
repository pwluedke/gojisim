import { defineSwitch } from "./define";

/** #460: 1 (the default): a deck with no plan uses its cards before passing; 0 off. */
export default defineSwitch({
  name: "noPlanUse",
  default: 1,
  group: "search",
  what: "The no-plan play's rule 1 (Ian, R-43): for a deck with no plan of its own (not Wrangler, Tangler, Monster X, or Fest with `festPlan`), no passing while a battle card can be played or a spare monster card raged (one Paul's rules don't hold for a rank-up). With `rules`.",
  from: "#460",
  status: "built",
});
