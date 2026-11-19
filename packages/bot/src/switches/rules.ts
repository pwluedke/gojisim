import { defineSwitch } from "./define";

/** #175: 1 applies the play rules at the root (`rules.ts`): prunes and prior bonuses. */
export default defineSwitch({
  name: "rules",
  default: 0,
  defaultNote: "0; 1 from Hard (`difficulty.ts`)",
  group: "search",
  what: "The play rules at the root of the search (`rules.ts`): they leave out some moves and give others a head start.",
  from: "#175",
  status: "kept",
});
