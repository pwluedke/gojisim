import { defineSwitch } from "./define";

/** #403 rule 6: 1 (the default) keeps a Destoroyah enabler and holds Godzilla vs. Destoroyah for the final or saving counter; 0 off. */
export default defineSwitch({
  name: "tanglerSave",
  default: 1,
  group: "tangler",
  option: "save",
  what: "The Tangler plan's rule 6 (Nov 16): any Destoroyah battle card (EBP01-049, EBP01-054, EBP02-037) turns on Godzilla vs. Destoroyah. With none on your field, keep the last rank 4 or 6 copy in your hand: don't discard it or pay a cost with it, and don't play it unless the play gives you this turn's counter. Hold Godzilla vs. Destoroyah for the final counter (when the opponent's monster deck is empty) or for the counter that stops a losing invasion (their monster in zone 6 or beyond). This needs the Tangler plan (`tanglerPlan`).",
  from: "#403",
  status: "built",
});
