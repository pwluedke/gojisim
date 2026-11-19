import { defineSwitch } from "./define";

/** The Wrangler play guide's rules against Biollante: 1 (the default) on; 0 off. */
export default defineSwitch({
  name: "wranglerBio",
  default: 1,
  group: "wrangler",
  option: "bio",
  what: "The Wrangler play guide's rules against Biollante: don't counter Biollante Rose Form; don't push their monster out of zone 5; make the all-out invasion from Godzilla (2023) EBP01-010; keep your Godzilla, King of the Monsters cards spread apart; play Godzilla Against Mechagodzilla before Biollante reaches rank 7; don't play a strategy card against EBP02-027 in zone 5 or beyond; and raise rage to 4 instead of 3 to protect Godzilla, King of the Monsters, since Meganula can take 1 rage away.",
  from: "Nov 15",
  status: "built",
});
