import { defineSwitch } from "./define";

/** Paul, Nov 12: 1 applies the card-play rules (`cardRules.ts`), also on with `rules`. */
export default defineSwitch({
  name: "cardRules",
  default: 0,
  defaultNote: "0; 1 from Medium",
  group: "search",
  what: "The card-play rules (`cardRules.ts`), also on with `rules`.",
  from: "Paul, Nov 12",
  status: "kept",
});
