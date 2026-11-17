import { defineSwitch } from "./define";

/** #408: 1 (the default): rage at rank 3 and with the rank 4 Flying Form; 0 off. */
export default defineSwitch({
  name: "spacegRage",
  default: 1,
  group: "spaceg",
  option: "rage",
  what: "The SpaceG plan's rule 2 (Paul): at rank 3 (SpaceGodzilla EBP02-054: each rage destroys a rank 5 or lower battle card of theirs per Crystals) with Crystals and a target, and with the rank 4 Flying Form EBP02-057 (each rage makes 2 Crystals), no passing while a rage discard can be made. Needs `spacegPlan`.",
  from: "#408",
  status: "built",
});
