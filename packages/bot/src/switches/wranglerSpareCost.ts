import { defineSwitch } from "./define";

/** #418: 1 (the default) pays early invasions with spare strategies; 0 off. */
export default defineSwitch({
  name: "wranglerSpareCost",
  default: 1,
  group: "wrangler",
  option: "spareCost",
  what: "The Wrangler plan's spare cost (Nov 16): early on (your monster at rank I or II), an invasion paid with a spare strategy card (The Slithering Disaster, or a Despair beyond the one the plan keeps) is freed from the plan's \"don't race\" rule (invade only when it wins this turn), to clear the dead card out of your hand. Monster cards still go for rage, and Godzilla Landing is never a spare (card rule 31). This needs version 2 of the Wrangler plan (`wranglerPlan` set to 2).",
  from: "#418",
  status: "built",
});
