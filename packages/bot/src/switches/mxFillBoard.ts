import { defineSwitch } from "./define";

/** #377: 1 (the default) plays every playable battle card rather than passing; 0 off. */
export default defineSwitch({
  name: "mxFillBoard",
  default: 1,
  group: "mxPlan",
  option: "fillBoard",
  what: "The Monster X plan's fill-the-board rule (Nov 16): play every playable battle card this turn, big ones included, instead of holding them. Don't end the turn while a battle card that the plan's other rules allow can be played into a zone the opponent's monster can't destroy (not the column of their monster's zone or of the next zone it moves into). This needs version 2 of the Monster X plan (`mxPlan` set to 2).",
  from: "#377",
  status: "built",
});
