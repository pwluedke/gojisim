import { defineSwitch } from "./define";

/** #358: 1 (the default) keys a field card's choice option by its zone too; 0 by card id only. */
export default defineSwitch({
  name: "targetKey",
  default: 1,
  group: "search",
  what: "The search tells apart a choice that names a card on the field by its zone too (`card<id>@P2:8`), so copies of one card in different zones count as different moves; 0 tells them apart by card id only.",
  from: "#358",
  status: "built",
});
