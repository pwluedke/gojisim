import type { CfTarget } from "../cfTarget";
import { defineSwitch } from "./define";

/** Paul's Constructed Future test, with `rules` on: which card cost discards aim at (`cfTarget.ts`). */
export default defineSwitch({
  name: "cfTarget",
  default: "auto" as CfTarget,
  defaultNote: "`auto`",
  group: "search",
  what: "Which card cost discards aim at in Paul's Constructed Future test (`cfTarget.ts`).",
  from: "Paul",
  status: "kept",
});
