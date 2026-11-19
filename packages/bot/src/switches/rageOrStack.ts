import { defineSwitch } from "./define";

/** Nov 19 decision: 1 (the default) is play rule 3's new form (rage or stack, one card one rank up kept); 0 the old form (no pass while a card can go to rage). */
export default defineSwitch({
  name: "rageOrStack",
  default: 1,
  group: "search",
  what: "Play rule 3, rage or stack: don't end the turn while a monster card in your hand can still be discarded for rage or played on top of your monster. One exception: keep one monster card that is exactly one rank above your monster, has its own ability when played on top and shares a trait with it, to play on top after the rank-up. Discard even that card for rage when one more rage would likely stop the opponent from making the counter next turn (judged across the bot's guesses of their hand).",
  from: "#478",
  status: "built",
});
