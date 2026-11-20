import { defineSwitch } from "./define";

/** #403: 1 keeps the hand once the counter is made; 0 (the default, #479, Nov 18) plays battle cards out to cycle. */
export default defineSwitch({
  name: "tanglerStop",
  default: 0,
  group: "tangler",
  option: "stop",
  what: "The Tangler plan's rule 5: once you have enough counter power to counter the opponent's monster, battle card plays, strategy cards and rage gains wait (except Entangling Fear and the low evolution cards), so the rest of the hand is kept for later turns. Off by default (#479): playing battle cards out draws more cards, cycles toward Entangling Fear and grows evolutions; rule 6 still keeps a Destoroyah back. This needs the Tangler plan (`tanglerPlan`).",
  from: "#403",
  status: "built",
});
