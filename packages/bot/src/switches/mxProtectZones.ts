import { defineSwitch } from "./define";

/** Monster X plan rule 17 (#371): 1 (the default) keeps protected cards in zones 1-5; 0 off. */
export default defineSwitch({
  name: "mxProtectZones",
  default: 1,
  group: "mxPlan",
  option: "protectZones",
  what: "Monster X plan rule 17: with Godzilla and its son on Monster Island EBP01-080 in the bot's cards, a rank 5 or lower battle card goes to zones 1-5 off its monster's path, not 6-8; the blue Monster X EBP04-047 may go to zone 8 with Kaizer Ghidorah EBP04-068 to evolve into (Paul).",
  from: "#371",
  status: "built",
});
