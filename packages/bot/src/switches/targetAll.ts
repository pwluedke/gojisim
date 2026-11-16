import { defineSwitch } from "./define";

/** Card rule 22b (#378): 1 leaves out one-shot strategies that do nothing; 0 (the default, Paul's option 1, Nov 16: its check leaned worse, 98 vs 105 of 172, p = 0.07) is off until a rerun. */
export default defineSwitch({
  name: "targetAll",
  default: 0,
  group: "cardRules",
  option: "targetAll",
  what: "Card rule 22b: a strategy with only one-shot abilities isn't activated when no way of answering its choices changes the board, rage, discard pile or decks; with 2+ copies in hand a spare may still go as hand cycling (Paul). Off by default: its check leaned worse (98 vs 105 of 172, p = 0.07; Paul, Nov 16); a 360-game rerun is queued.",
  from: "#378",
  status: "measured",
});
