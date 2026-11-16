import { defineSwitch } from "./define";

/** The Wrangler play guide's rules against Biollante (Ian): 1 (the default) on; 0 off. */
export default defineSwitch({
  name: "wranglerBio",
  default: 1,
  group: "wrangler",
  option: "bio",
  what: "The Wrangler play guide's rules against Biollante: no counter on its Rose Form, no push out of zone 5, the all-out invasion from Godzilla (2023) EBP01-010, Kings spread apart, GAM down before its rank 7, no strategy against EBP02-027 in zone 5+, and a 4-rage target for the King (Meganula).",
  from: "Ian, Nov 15",
  status: "built",
});
