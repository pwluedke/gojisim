import { defineSwitch } from "./define";

/** #403 rule 6: 1 (the default) keeps a Destoroyah enabler and holds Godzilla vs. Destoroyah for the final or saving counter; 0 off. */
export default defineSwitch({
  name: "tanglerSave",
  default: 1,
  group: "tangler",
  option: "save",
  what: "The Tangler plan's rule 6 (BFW182; Monarch, Nov 16): any Destoroyah battle card (EBP01-049, EBP01-054, EBP02-037) turns on Godzilla vs. Destoroyah; with none on your field the last rank 4 or 6 copy in hand stays (not discarded or paid with, nor played unless the play makes this turn's counter); Godzilla vs. Destoroyah is held for the final counter (their monster deck empty) or the one that stops a losing invasion (their monster in zone 6 or beyond). Needs `tanglerPlan`.",
  from: "#403",
  status: "built",
});
