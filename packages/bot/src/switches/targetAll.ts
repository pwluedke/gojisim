import { defineSwitch } from "./define";

/** Card rule 22b (#378): 1 leaves out one-shot strategies that do nothing; 0 (the default, option 1, Nov 16: its check leaned worse, 98 vs 105 of 172, p = 0.07) is off until a rerun. */
export default defineSwitch({
  name: "targetAll",
  default: 0,
  group: "cardRules",
  option: "targetAll",
  what: "Card rule 22b: don't activate a strategy card that has only one-shot abilities when no way of answering its choices changes the board, the rage, the discard pile or the decks. With 2 or more copies in hand, a spare copy may still be played to cycle your hand. Off by default: its check came out slightly worse (98 vs 105 wins of 172 games, p = 0.07; Nov 16), and a 360-game rerun is queued.",
  from: "#378",
  status: "measured",
});
