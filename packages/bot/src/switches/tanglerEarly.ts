import { defineSwitch } from "./define";

/** Card rule 29 (#314): 1 (the default) keeps a Tangler deck back through its turn 3; 0 off. */
export default defineSwitch({
  name: "tanglerEarly",
  default: 1,
  group: "cardRules",
  option: "tanglerEarly",
  what: "Card rule 29: a Tangler deck (Godzilla (2002) EBP03-014 and EBP03-015 in its monster deck, Entangling Fear EBP04-081 in its main deck; Paul's signature) doesn't invade before its own turn 4 unless the invasion wins this turn.",
  from: "#314",
  status: "built",
});
