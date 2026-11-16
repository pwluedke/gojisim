import { defineSwitch } from "./define";

/** Card rule 21 (#304): 1 (the default) keeps battle cards off your own monster's path; 0 is off. */
export default defineSwitch({
  name: "ownPath",
  default: 1,
  group: "cardRules",
  option: "ownPath",
  what: "Card rule 21: no battle card into your own monster's next two zones (its advance or invasion crushes it there) while it has a legal play into an empty zone off them; [revenge] cards excepted.",
  from: "#304",
  status: "built",
});
