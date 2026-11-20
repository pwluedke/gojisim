import { defineSwitch } from "./define";

/** Card rule 34 (#364, #380): 1 (the default) favors a Godzilla Landing after which this turn's counter is made; 0 off. */
export default defineSwitch({
  name: "landingIntoCounter",
  default: 1,
  group: "search",
  what: "Card rule 34: favor activating Godzilla Landing EBP01-030 when its push lets you make the counter this turn, by itself or with one more battle card. It's a head start in the search, not a rule: a Landing with no counter after it isn't left out.",
  from: "#364",
  status: "built",
});
