import { defineSwitch } from "./define";

/** Card rule 23b (#345): 1 (the default) covers your own token before a battle card; 0 off. */
export default defineSwitch({
  name: "coverToken",
  default: 1,
  group: "cardRules",
  option: "coverToken",
  what: "Card rule 23b: with no empty zone off your monster's path, but a legal play over your own token, a play over your own battle card is left out.",
  from: "#345",
  status: "built",
});
