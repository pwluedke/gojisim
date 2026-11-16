import { defineSwitch } from "./define";

/** #305: 1 (the default) has card rule 7 take the counter before the zone 8 block; 0 is the old rule 7. */
export default defineSwitch({
  name: "counterFirst",
  default: 1,
  group: "cardRules",
  option: "counterFirst",
  what: "Card rule 7 takes the counter before the zone 8 block; 0 is the old rule 7.",
  from: "#305, #320",
  status: "kept",
});
