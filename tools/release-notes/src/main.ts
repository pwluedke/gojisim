import { join } from "node:path";
import { parseArgs } from "node:util";
import { git } from "./git";
import { joinUnreleased } from "./join";
import { block } from "./notes";

/**
 * `pnpm release-notes [--dry-run]` (#89), run from the repo root on an up-to-date `main`: joins
 * every notes file in `docs/release-notes/unreleased/` that is on main into
 * `docs/release-notes.md` (newest merge first, `## #<PR> <title> (<merge date>)`) and removes
 * them. `--dry-run` prints the blocks and changes nothing.
 */
const { values } = parseArgs({
  options: { "dry-run": { type: "boolean", default: false } },
});
const root = join(process.env["INIT_CWD"] ?? process.cwd());
const run = git(root);
const result = joinUnreleased(root, run, "HEAD", !values["dry-run"]);
for (const { entry, merge } of result.joined) console.log(block(entry, merge));
for (const file of result.pending)
  console.log(`Not on main yet, left: ${file}`);
if (result.joined.length === 0) console.log("No unreleased notes to join.");
else if (!values["dry-run"])
  console.log(
    `Joined ${result.joined.length} entr${result.joined.length === 1 ? "y" : "ies"} into docs/release-notes.md.`,
  );
