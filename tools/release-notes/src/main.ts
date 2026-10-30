import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { git } from "./git";
import { joinUnreleased } from "./join";
import { block } from "./notes";
import { publish } from "./publish";

/**
 * `pnpm release-notes [--dry-run]` (#89), Paul's deploy step, run from the repo root: joins every
 * notes file in `docs/release-notes/unreleased/` that is on `origin/main` into
 * `docs/release-notes.md` (newest merge first, `## #<PR> <title> (<merge date>)`) through a PR
 * that merges itself once `ci` passes, and prints its URL. Paul's checkout isn't changed.
 * `--dry-run` prints the entries main has now and changes nothing.
 */
const { values } = parseArgs({
  options: { "dry-run": { type: "boolean", default: false } },
});
const root = join(process.env["INIT_CWD"] ?? process.cwd());
const run = git(root);

if (values["dry-run"]) {
  run(["fetch", "--quiet", "origin", "main"]);
  const result = joinUnreleased(root, run, "origin/main", false);
  for (const { entry, merge } of result.joined)
    console.log(block(entry, merge));
  for (const file of result.pending) console.log(`Not on main yet: ${file}`);
  if (result.joined.length === 0) console.log("No unreleased notes on main.");
  process.exit(0);
}

const gh = (args: string[]) =>
  execFileSync("gh", args, { cwd: root, encoding: "utf8" }).trim();
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const result = publish(root, run, gh, date, git);
if (result.kind === "autoMergeOff") {
  console.error(
    "The repo doesn't allow auto-merge, so the release notes PR couldn't merge itself. Turn on GitHub → Settings → General → \"Allow auto-merge\" once (docs/deploy.md), then run this again. Nothing was changed.",
  );
  process.exit(1);
}
if (result.kind === "nothing")
  console.log("No unreleased notes on main: nothing to join, no PR opened.");
else
  console.log(
    `Release notes PR (${result.count} entr${result.count === 1 ? "y" : "ies"}), merging by itself once ci passes:\n${result.url}`,
  );
