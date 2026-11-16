import { defineSwitch } from "./define";

/** v2.3 of the Wrangler plan (Ian's guide review): 1 (the default) on; 0 is v2.2. */
export default defineSwitch({
  name: "wranglerV23",
  default: 1,
  group: "wrangler",
  option: "v23",
  what: "Wrangler plan v2.3 (Ian's review of the Wrangler play guide): every monster card but Godzilla (2004) pitched for rage; a push needs the counter that turn; against Monster X, dig to 2 battle cards. 0 is v2.2.",
  from: "Ian, Nov 15",
  status: "built",
});
