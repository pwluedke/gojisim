import { defineSwitch } from "./define";

/** #418: 1 (the default) pays early invasions with spare strategies; 0 off. */
export default defineSwitch({
  name: "wranglerSpareCost",
  default: 1,
  group: "wrangler",
  option: "spareCost",
  what: "The Wrangler plan's spare cost (Ian; Paul's option a, Nov 16): early (your monster at rank I or II), an invasion paid with a spare strategy (The Slithering Disaster, or a Despair beyond the one the plan keeps) is freed from \"don't race\", to clear the dead card out of the hand; monster cards still go for rage, and Godzilla Landing is never a spare (card rule 31). Needs `wranglerPlan` 2.",
  from: "#418",
  status: "built",
});
