import { defineSwitch } from "./define";

/** #305: 1 (the default) has card rule 7 take the counter before the zone 8 block; 0 is the old rule 7. */
export default defineSwitch({
  name: "counterFirst",
  default: 1,
  group: "cardRules",
  option: "counterFirst",
  what: "Card rule 7 goes for a counter against the opponent's monster before it puts a battle card in your zone 8 to block their invasion. With this switch off (0), card rule 7 works the old way.",
  from: "#305, #320",
  status: "kept",
});
