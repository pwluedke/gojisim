import { defineSwitch } from "./define";

/** v2.2 of the Wrangler plan (#318): 1 (the default) on; 0 is v2.1. */
export default defineSwitch({
  name: "wranglerV22",
  default: 1,
  group: "wrangler",
  option: "v22",
  what: "Wrangler plan v2.2: dig with no battle card in hand (#318), Despair's targets, the Godzilla (2023) ESD01-002 fetch invasion only when needed, GAM's reset saved for the counter. 0 is v2.1.",
  from: "#318, Ian",
  status: "built",
});
