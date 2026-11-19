import { defineSwitch } from "./define";

/** v2.3 of the Wrangler plan (a tester's guide review): 1 (the default) on; 0 is v2.2. */
export default defineSwitch({
  name: "wranglerV23",
  default: 1,
  group: "wrangler",
  option: "v23",
  what: "Version 2.3 of the Wrangler plan (from a tester's review of the Wrangler play guide): discard every monster card except Godzilla (2004) for rage; a push needs the counter that same turn; and against Monster X, dig until you have 2 battle cards in hand. 0 uses version 2.2.",
  from: "Nov 15",
  status: "built",
});
