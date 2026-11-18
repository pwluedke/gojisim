import { defineSwitch } from "./define";

/** #425: 1 (the default) counts a King to be played toward v2.2's fetch invasion; 0 off. */
export default defineSwitch({
  name: "wranglerFetchRage",
  default: 1,
  group: "wrangler",
  option: "fetchRage",
  what: "The Wrangler plan's fetch for rage (Ian): with Godzilla (2023) ESD01-002 on top, v2.2's invasion for its fetch (a rank III Godzilla (2023) per zone it invades) counts a King to be played this turn as one to protect with 3 rage, not only one in zones 1-5; with such an invasion, tagging out (its fetch goes with it) and passing wait. Needs `wranglerPlan` 2.",
  from: "#425",
  status: "built",
});
