import { defineSwitch } from "./define";

/** v2.1 of the Wrangler plan (#316, #317, #319, #321): 1 (the default) on; 0 is v2. */
export default defineSwitch({
  name: "wranglerV21",
  default: 1,
  group: "wrangler",
  option: "v21",
  what: "Wrangler plan v2.1 (#316, #317, #319, #321); 0 is v2.",
  from: "#332",
  status: "kept",
});
