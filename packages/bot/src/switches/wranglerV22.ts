import { defineSwitch } from "./define";

/** v2.2 of the Wrangler plan (#318): 1 (the default) on; 0 is v2.1. */
export default defineSwitch({
  name: "wranglerV22",
  default: 1,
  group: "wrangler",
  option: "v22",
  what: "Version 2.2 of the Wrangler plan: when you have no battle card in hand, dig (play cards out of your hand so the end phase draws more) (#318); choose Despair's targets; make the Godzilla (2023) ESD01-002 fetch invasion only when it's needed; and save Godzilla Against Mechagodzilla's rage reset for the counter. 0 uses version 2.1.",
  from: "#318",
  status: "built",
});
