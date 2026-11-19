import { defineSwitch } from "./define";

/** Monster X plan rule 17 (#371): 1 (the default) keeps protected cards in zones 1-5; 0 off. */
export default defineSwitch({
  name: "mxProtectZones",
  default: 1,
  group: "mxPlan",
  option: "protectZones",
  what: "Monster X plan rule 17: when Godzilla and its son on Monster Island EBP01-080 is among the bot's cards, play a battle card of rank 5 or lower into zones 1-5 outside your monster's path, not into zones 6-8. The blue Monster X EBP04-047 may still go to zone 8 when it can evolve into Kaizer Ghidorah EBP04-068 there.",
  from: "#371",
  status: "built",
});
