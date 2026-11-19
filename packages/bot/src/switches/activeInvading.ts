import { defineSwitch } from "./define";

/** Card rule 26 (#328): 1 (the default) doesn't bury an active [invading] ability; 0 is off. */
export default defineSwitch({
  name: "activeInvading",
  default: 1,
  group: "cardRules",
  option: "activeInvading",
  what: "Card rule 26: when the [invading] ability of your top monster card is active (enough cards are under it, as with EBP03-029) and you can invade, don't play a monster card without an [invading] ability on top of it, unless that play wins the game now or gives you enough counter power to counter the opponent's monster this turn.",
  from: "#328",
  status: "built",
});
