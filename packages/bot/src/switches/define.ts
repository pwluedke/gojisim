/**
 * #402 (Paul, Nov 16): one file per bot switch, so two bot PRs that each add a switch never edit
 * the same lines. A switch's file holds everything about it: its default, the plan it belongs
 * to, and its row in `SWITCHES.md` (generated from these files by `pnpm switches`).
 */

/** Where a switch is read: a plan's options object, or the search's own settings. */
export type SwitchGroup =
  "search" | "cardRules" | "mxPlan" | "wrangler" | "fest" | "tangler";

/** The status column of `SWITCHES.md`. */
export type SwitchStatus = "built" | "measured" | "kept";

export interface SwitchDef {
  /** Its name in `IsmctsSettings` and in a plan's `aSettings` ("<name>=0"). */
  name: string;
  /** Its default in `ISMCTS_DEFAULTS` (1 is on, 0 is off; a few take other values). */
  default: number | string;
  /** The Default column when it says more than the value ("0; 1 from Hard"). */
  defaultNote?: string;
  group: SwitchGroup;
  /** Its key in its group's options object, when it isn't the switch's name. */
  option?: string;
  /** What it turns on (the table's "What it turns on" column). */
  what: string;
  /** The issue or person it came from. */
  from: string;
  status: SwitchStatus;
}

/** A switch's file: `export default defineSwitch({ ... })`; keeps its name's literal type. */
export function defineSwitch<const T extends SwitchDef>(def: T): T {
  return def;
}
