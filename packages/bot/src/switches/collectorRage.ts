import { defineSwitch } from "./define";

/** #346: 1 (the default) lets Paul's rule 2 rage a same-name collector with a copy left; 0 off. */
export default defineSwitch({
  name: "collectorRage",
  default: 1,
  group: "search",
  what: "Paul's rule 2 doesn't hold a monster card whose [enter] puts its same-name cards from your discard pile under it (King Ghidorah (1965) EBP02-046) while another copy is in your monster deck, hand or monster stack, so it can go to rage.",
  from: "#346",
  status: "built",
});
