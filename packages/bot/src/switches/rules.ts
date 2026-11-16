import { defineSwitch } from "./define";

/** #175: 1 applies Paul's play rules at the root (`rules.ts`): prunes and prior bonuses. */
export default defineSwitch({
  name: "rules",
  default: 0,
  defaultNote: "0; 1 from Hard (`difficulty.ts`)",
  group: "search",
  what: "Paul's play rules at the search root (`rules.ts`): prunes and prior bonuses.",
  from: "#175",
  status: "kept",
});
