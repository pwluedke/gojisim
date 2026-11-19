import { defineSwitch } from "./define";

/** The Monster X plan's #338 (Manda's discount as a setup play): 1 (default) on; 0 old rule 3. */
export default defineSwitch({
  name: "mxManda",
  default: 1,
  group: "mxPlan",
  option: "manda",
  what: "The Monster X plan's rule from #338: use Manda (2004) EBP04-045's discount (discard a battle card to play Manda at a lower rank) only to cheat out the white Monster X EBP03-067 when the battle cards in your zones have 2 or more colors, or to discard a battle card of a color that the battle cards in your discard pile don't have yet. Otherwise play Manda at its full rank, or not at all.",
  from: "#338",
  status: "built",
});
