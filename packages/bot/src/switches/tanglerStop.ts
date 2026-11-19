import { defineSwitch } from "./define";

/** #403: 1 (the default): the hand kept once the counter is made; 0 off. */
export default defineSwitch({
  name: "tanglerStop",
  default: 1,
  group: "tangler",
  option: "stop",
  what: "The Tangler plan's rule 5: once you have enough counter power to counter the opponent's monster, battle card plays, strategy cards and rage gains wait (except Entangling Fear and the low evolution cards), so the rest of the hand is kept for later turns. This needs the Tangler plan (`tanglerPlan`).",
  from: "#403",
  status: "built",
});
