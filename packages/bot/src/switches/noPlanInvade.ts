import { defineSwitch } from "./define";

/** #460: 1 (the default): a deck with no plan invades only with a reason; 0 off. */
export default defineSwitch({
  name: "noPlanInvade",
  default: 1,
  group: "search",
  what: "Rule 2 for a deck with no plan of its own (report R-43): an invasion that doesn't win the game now waits, unless the invading monster has an [invading] ability or the invasion is what gives you enough counter power to counter the opponent's monster (you have it after the invasion, not before). Used with the play rules (`rules`).",
  from: "#460",
  status: "built",
});
