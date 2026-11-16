import { defineSwitch } from "./define";

/** #191: 1 draws the opponent's hidden cards toward a recognized archetype (`recognizer.ts`). */
export default defineSwitch({
  name: "recognizer",
  default: 0,
  defaultNote: "0; 1 from Hard",
  group: "search",
  what: "The deck recognizer: the opponent's hidden cards drawn toward a recognized archetype (`recognizer.ts`).",
  from: "#191",
  status: "kept",
});
