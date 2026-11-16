import type { SwitchGroup } from "./define";
import { SWITCHES } from "./index";

/**
 * #402: the switches' part of `IsmctsSettings` and `ISMCTS_DEFAULTS`, built from the switch
 * files, and each plan's options object built from the settings, so a new switch is a new file,
 * not an edit to a shared list or a new positional parameter.
 */

type Switch = (typeof SWITCHES)[number];
export type SwitchName = Switch["name"];

/** Each switch's setting: a number, or its own type when its default isn't one (`cfTarget`). */
export type SwitchSettings = {
  [S in Switch as S["name"]]: S["default"] extends number
    ? number
    : S["default"];
};

/**
 * A plan's options object, from its group's switch files: each switch under its option key (its
 * name, or its `option`), on unless `false`. A new switch adds a key here by adding its file.
 */
export type GroupOptions<G extends SwitchGroup> = {
  [
    S in Extract<Switch, { group: G }> as S extends {
      option: infer O extends string;
    }
      ? O
      : S["name"]
  ]?: boolean;
};

export const SWITCH_DEFAULTS = Object.fromEntries(
  SWITCHES.map((s) => [s.name, s.default]),
) as SwitchSettings;

/**
 * A plan's options from the settings: each switch of `group` under its option key, on when its
 * setting is above 0 (`{ landing: true, manda: false, ... }`).
 */
export function groupOptions(
  settings: SwitchSettings,
  group: SwitchGroup,
): Record<string, boolean> {
  return Object.fromEntries(
    SWITCHES.filter((s) => s.group === group).map((s) => [
      "option" in s ? s.option : s.name,
      Number(settings[s.name as SwitchName]) > 0,
    ]),
  );
}
