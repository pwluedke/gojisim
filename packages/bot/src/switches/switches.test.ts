import { readdirSync, readFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";
import { describe, expect, it } from "vitest";
import { cardRuleOptions, ISMCTS_DEFAULTS } from "../ismcts";
import { SWITCHES } from "./index";
import { renderIndex, renderTable } from "./render";
import { groupOptions } from "./settings";

/**
 * #402: one file per bot switch. The index and `SWITCHES.md` are generated from the files
 * (`pnpm switches`), and every setting keeps its name and default from before the change.
 */

const DIR = new URL(".", import.meta.url).pathname;
const MD = new URL("../../SWITCHES.md", import.meta.url).pathname;
const NOT_SWITCHES = new Set(["define", "render", "index", "settings"]);

/** `ISMCTS_DEFAULTS` on main just before #402 (the search settings and every switch). */
const BEFORE: Record<string, number | string> = {
  activeInvading: 1,
  blunder: 0,
  cardRules: 0,
  cfPlan: 1,
  cfTarget: "auto",
  collectorRage: 1,
  counterAlways: 1,
  counterFirst: 1,
  coverToken: 1,
  exploration: 0.7,
  festPlan: 0,
  iterations: 1000,
  keepLowRank: 1,
  keepStrategy: 1,
  maxMs: 1000,
  modeBest: 1,
  mxFearReach: 1,
  mxLanding: 1,
  mxManda: 1,
  mxPlan: 2,
  mxProtectZones: 1,
  mxTargets: 1,
  mxWhiteKeep: 1,
  ownBehind: 1,
  ownCover: 1,
  ownPath: 1,
  priorVisits: 0,
  prune: 0,
  recognizer: 0,
  recurDiscard: 1,
  revengeStep: 1,
  rollout: "weighted",
  rolloutDecisions: 60,
  rolloutTurns: 1,
  rules: 0,
  tanglerEarly: 1,
  targetAll: 0,
  targetCheck: 1,
  targetKey: 1,
  temperature: 0,
  uniformBlunder: 0,
  wranglerBio: 1,
  wranglerBioHard: 0,
  wranglerPlan: 2,
  wranglerPushLine: 1,
  wranglerV21: 1,
  wranglerV22: 1,
  wranglerV23: 1,
};

describe("bot switches, one file each (#402)", () => {
  it("the index lists every switch file (run `pnpm switches` after adding one)", () => {
    const names = readdirSync(DIR)
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .map((f) => f.replace(/\.ts$/, ""))
      .filter((n) => !NOT_SWITCHES.has(n));
    expect(readFileSync(`${DIR}index.ts`, "utf8")).toBe(renderIndex(names));
    // Each file's switch is named after it, and no two share a name.
    for (const s of SWITCHES) expect(names).toContain(s.name);
    expect(new Set(SWITCHES.map((s) => s.name)).size).toBe(SWITCHES.length);
  });

  it("SWITCHES.md is the table built from the files (run `pnpm switches`)", async () => {
    const text = await format(renderTable(SWITCHES), {
      ...(await resolveConfig(MD)),
      parser: "markdown",
    });
    expect(readFileSync(MD, "utf8")).toBe(text);
  });

  it("every setting keeps its name and default", () => {
    expect(ISMCTS_DEFAULTS).toEqual(BEFORE);
  });

  it("the plans' options come from their switch files, under the plans' own option names", () => {
    const options = cardRuleOptions(ISMCTS_DEFAULTS);
    expect(Object.keys(options).sort()).toEqual(
      SWITCHES.filter((s) => s.group === "cardRules")
        .map((s) => s.name)
        .sort(),
    );
    expect(options.targetAll).toBe(false);
    expect(options.counterFirst).toBe(true);
    expect(
      groupOptions({ ...ISMCTS_DEFAULTS, mxLanding: 0 }, "mxPlan"),
    ).toMatchObject({
      landing: false,
      manda: true,
      protectZones: true,
    });
    expect(
      groupOptions({ ...ISMCTS_DEFAULTS, wranglerBioHard: 0 }, "wrangler"),
    ).toEqual({
      v21: true,
      v22: true,
      v23: true,
      bio: true,
      bioHard: false,
      pushLine: true,
    });
  });
});
