import { defineSwitch } from "./define";

/** #339: 1 (the default) keeps a [revenge] card out of zone 8 unless it's stepped on; 0 is off. */
export default defineSwitch({
  name: "revengeStep",
  default: 1,
  group: "cardRules",
  option: "revengeStep",
  what: "A [revenge] card goes in zone 8 only when an invasion this turn takes your own monster there.",
  from: "#339",
  status: "built",
});
