import { defineSwitch } from "./define";

/** #346: 1 (the default) lets play rule 2 rage a same-name collector with a copy left; 0 off. */
export default defineSwitch({
  name: "collectorRage",
  default: 1,
  group: "search",
  what: "Play rule 2 (keep one monster card per rank in hand to play on top later) doesn't keep a monster card whose [enter] ability puts the cards with its name from your discard pile under it (King Ghidorah (1965) EBP02-046) while another copy is still in your monster deck, hand or monster stack, so that card can be discarded for rage.",
  from: "#346",
  status: "built",
});
