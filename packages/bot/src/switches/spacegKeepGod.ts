import { defineSwitch } from "./define";

/** Nov 18 decision: 1 (the default) never pays an invasion or a rage discard with God of Destruction's Counterattack EBP02-072 but an invasion that wins; 0 off. */
export default defineSwitch({
  name: "spacegKeepGod",
  default: 1,
  group: "spaceg",
  option: "keepGod",
  what: "The SpaceG plan's rule 5: never discard God of Destruction's Counterattack EBP02-072 to pay for an invasion or to gain rage, unless that invasion wins the game. Needs `spacegPlan`.",
  from: "#478",
  status: "built",
});
