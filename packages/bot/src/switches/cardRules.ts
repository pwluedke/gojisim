import { defineSwitch } from "./define";

/** Nov 12: 1 applies the card-play rules (`cardRules.ts`), also on with `rules`. */
export default defineSwitch({
  name: "cardRules",
  default: 0,
  defaultNote: "0; 1 from Medium",
  group: "search",
  what: "The card-play rules (`cardRules.ts`) are on. They also come on with the play rules (`rules`).",
  from: "Nov 12",
  status: "kept",
});
