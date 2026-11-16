import { defineSwitch } from "./define";

/** Card rule 26 (#328): 1 (the default) doesn't bury an active [invading] ability; 0 is off. */
export default defineSwitch({
  name: "activeInvading",
  default: 1,
  group: "cardRules",
  option: "activeInvading",
  what: "Card rule 26: with your top monster's [invading] ability active (its count of cards under it met, EBP03-029) and an invasion legal, no monster card without an [invading] ability on top of it, but a play that wins now or makes the counter.",
  from: "#328",
  status: "built",
});
