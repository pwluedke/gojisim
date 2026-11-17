import { defineSwitch } from "./define";

/** #419: 1 (the default) applies card rule 31, Paul's Godzilla Landing rule; 0 off. */
export default defineSwitch({
  name: "landingRule",
  default: 1,
  group: "cardRules",
  what: "Card rule 31 (Paul, Nov 16: Godzilla Landing EBP01-030 is sacred in any deck): it's never discarded (a discard pick takes another card; no invasion is paid with it but one that wins now), never played at a monster already in zone 8, and never played unless the counter is certain this turn (made after it, or one battle card play away); rule 7's way to the counter still outranks it.",
  from: "#419",
  status: "built",
});
