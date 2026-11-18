import { defineSwitch } from "./define";

/** #377: 1 (the default) plays every playable battle card rather than passing; 0 off. */
export default defineSwitch({
  name: "mxFillBoard",
  default: 1,
  group: "mxPlan",
  option: "fillBoard",
  what: "The Monster X plan's fill the board (Paul, Nov 16): every playable battle card is played this turn, big ones included, rather than held: no passing while one the plan's other rules leave standing can be played into a zone out of reach of their monster's destroy (not the column of their monster's zone or its next one). Needs `mxPlan` 2.",
  from: "#377",
  status: "built",
});
