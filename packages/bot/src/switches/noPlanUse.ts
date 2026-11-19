import { defineSwitch } from "./define";

/** #460: 1 (the default): a deck with no plan uses its cards before passing; 0 off. */
export default defineSwitch({
  name: "noPlanUse",
  default: 1,
  group: "search",
  what: "Rule 1 for a deck with no plan of its own (not Wrangler, Tangler, Monster X, or Fest with the Red Fest plan on) (report R-43): don't end the turn while a battle card can be played or a spare monster card can be discarded for rage (one the play rules don't keep in hand to play on top later). Used with the play rules (`rules`).",
  from: "#460",
  status: "built",
});
