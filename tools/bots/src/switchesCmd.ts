import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import {
  renderIndex,
  renderTable,
} from "../../../packages/bot/src/switches/render";

/*
 * #402: `pnpm switches` rewrites `packages/bot/src/switches/index.ts` (one import per switch
 * file) and `packages/bot/SWITCHES.md` (a section per switch) from the switch files. A test in
 * `packages/bot` fails when either is stale.
 */

const BOT = new URL("../../../packages/bot/", import.meta.url).pathname;
const DIR = join(BOT, "src/switches");
const NOT_SWITCHES = new Set(["define", "render", "index", "settings"]);

const names = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
  .map((f) => f.replace(/\.ts$/, ""))
  .filter((n) => !NOT_SWITCHES.has(n));
writeFileSync(join(DIR, "index.ts"), renderIndex(names));
// The table needs the switches themselves, from the index just written.
const { SWITCHES } = (await import(
  `${join(DIR, "index.ts")}?t=${Date.now()}`
)) as typeof import("../../../packages/bot/src/switches/index");
const md = join(BOT, "SWITCHES.md");
const text = await format(renderTable(SWITCHES), {
  ...(await resolveConfig(md)),
  parser: "markdown",
});
writeFileSync(md, text);
console.log(`${names.length} switches: index.ts and SWITCHES.md written`);
