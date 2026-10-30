import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git";
import { type Change, checkPr, parseEntry, UNRELEASED } from "./notes";

/**
 * `pnpm --filter @gojisim/release-notes check` (CI, #89): fails a PR that changes code under
 * `apps/` or `packages/` and adds no notes file, unless it is labeled `no-release-notes`; and
 * fails a notes file that doesn't parse. `BASE` is the PR's base (default `origin/main`), `LABELS`
 * its labels, comma-separated (CI reads them live, so a label added later counts on a re-run).
 */
const root = join(process.env["INIT_CWD"] ?? process.cwd());
const run = git(root);
const base = process.env["BASE"] || "origin/main";
const labels = (process.env["LABELS"] ?? "")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
const changes: Change[] = run([
  "diff",
  "--name-status",
  "--no-renames",
  `${base}...HEAD`,
])
  .split("\n")
  .filter((l) => l !== "")
  .map((l) => {
    const [status = "", path = ""] = l.split("\t");
    return { status, path };
  });
const problems: string[] = [];
for (const c of changes)
  if (
    c.status !== "D" &&
    c.path.startsWith(`${UNRELEASED}/`) &&
    c.path.endsWith(".md") &&
    !c.path.endsWith("/README.md")
  )
    try {
      parseEntry(c.path, readFileSync(join(root, c.path), "utf8"));
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
const missing = checkPr(changes, labels);
if (missing) problems.push(missing);
if (problems.length > 0) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`Release notes check passed (${changes.length} changed file(s)).`);
