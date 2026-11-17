import { defineSwitch } from "./define";

/** #384: 1 (the default) tags out to Godzilla (2001) against the opponent's rage reset; 0 off. */
export default defineSwitch({
  name: "wranglerTagOut",
  default: 1,
  group: "wrangler",
  option: "tagOut",
  what: "The Wrangler plan's tag-out against a rage reset (Ian): with the opponent's Godzilla Against Mechagodzilla EBP01-073 up and nothing under it (their next invasion sets your rage to 0), a tag-out to Godzilla (2001) EBP03-004 (from zone 4 its rage can't be reduced by their effects; the end-phase advance takes it there) goes before raging or passing. Needs `wranglerPlan` 2.",
  from: "#384",
  status: "built",
});
