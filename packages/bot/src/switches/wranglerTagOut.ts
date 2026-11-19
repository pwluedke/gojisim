import { defineSwitch } from "./define";

/** #384: 1 (the default) tags out to Godzilla (2001) against the opponent's rage reset; 0 off. */
export default defineSwitch({
  name: "wranglerTagOut",
  default: 1,
  group: "wrangler",
  option: "tagOut",
  what: "The Wrangler plan's tag-out against a rage reset: when the opponent has Godzilla Against Mechagodzilla EBP01-073 in play with nothing under it (their next invasion sets your rage to 0), tag out to Godzilla (2001) EBP03-004 (play it on top of your monster) before discarding for rage or ending the turn. From zone 4 its rage can't be lowered by the opponent's effects, and the end-phase advance takes it there. This needs version 2 of the Wrangler plan (`wranglerPlan` set to 2).",
  from: "#384",
  status: "built",
});
