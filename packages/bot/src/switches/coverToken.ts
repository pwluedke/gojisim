import { defineSwitch } from "./define";

/** Card rule 23b (#345): 1 (the default) covers your own token before a battle card; 0 off. */
export default defineSwitch({
  name: "coverToken",
  default: 1,
  group: "cardRules",
  option: "coverToken",
  what: "Card rule 23b: when there is no empty zone left outside the next two zones your monster will move into, but you can legally play over one of your own tokens, don't play over one of your own battle cards.",
  from: "#345",
  status: "built",
});
