import { defineSwitch } from "./define";

/** #425: 1 (the default) counts a King to be played toward v2.2's fetch invasion; 0 off. */
export default defineSwitch({
  name: "wranglerFetchRage",
  default: 1,
  group: "wrangler",
  option: "fetchRage",
  what: "The Wrangler plan's fetch for rage: with Godzilla (2023) ESD01-002 on top of your monster, version 2.2's invasion for its fetch (it brings a rank III Godzilla (2023) to your hand for each zone it invades) also counts a Godzilla, King of the Monsters you will play this turn as one to protect with 3 rage, not only one already in zones 1-5. When such an invasion can be made, tagging out (which gives up the fetch) and ending the turn wait. This needs version 2 of the Wrangler plan (`wranglerPlan` set to 2).",
  from: "#425",
  status: "built",
});
