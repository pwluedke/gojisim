import type { CfTarget } from "../cfTarget";
import { defineSwitch } from "./define";

/** The Constructed Future test, with `rules` on: which card cost discards aim at (`cfTarget.ts`). */
export default defineSwitch({
  name: "cfTarget",
  default: "auto" as CfTarget,
  defaultNote: "`auto`",
  group: "search",
  what: "In the Constructed Future test setting (`cfTarget.ts`), this chooses which card the bot discards for costs, since Constructed Future brings back the highest-rank battle card in the discard pile.",
  from: "Nov 4",
  status: "kept",
});
