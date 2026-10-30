import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Git } from "./git";
import { joinUnreleased } from "./join";
import { NOTES_FILE, SKIP_LABEL } from "./notes";

/** Runs `gh` and returns its trimmed output. */
export type Gh = (args: string[]) => string;

export type PublishResult =
  | { kind: "nothing" }
  | { kind: "autoMergeOff" }
  | { kind: "opened"; url: string; count: number };

/**
 * The deploy step (#89, option (a), Oct 30): main only takes PRs that passed `ci`, so the join
 * goes through a PR. In a temporary worktree from `origin/main` (the caller's checkout is left as
 * it is): join, commit, push a `release-notes-<date>` branch, open "Release notes for <date>"
 * labeled `no-release-notes`, and turn on auto-merge, so it merges itself once `ci` passes. Stops
 * before any of it when the repo doesn't allow auto-merge.
 */
export function publish(
  root: string,
  run: Git,
  gh: Gh,
  date: string,
  gitAt: (cwd: string) => Git,
): PublishResult {
  if (
    gh(["api", "repos/{owner}/{repo}", "--jq", ".allow_auto_merge"]) !== "true"
  )
    return { kind: "autoMergeOff" };
  run(["fetch", "--quiet", "origin", "main"]);
  const dir = mkdtempSync(join(tmpdir(), "release-notes-"));
  const existing = run([
    "branch",
    "--list",
    "--remotes",
    `origin/release-notes-${date}*`,
  ]);
  let branch = `release-notes-${date}`;
  for (let n = 2; existing.split(/\s+/).includes(`origin/${branch}`); n++)
    branch = `release-notes-${date}-${n}`;
  run(["worktree", "add", "--quiet", "-b", branch, dir, "origin/main"]);
  try {
    const tree = gitAt(dir);
    const { joined } = joinUnreleased(dir, tree, "HEAD", true);
    if (joined.length === 0) return { kind: "nothing" };
    const titles = joined.map(
      ({ entry, merge }) =>
        `- ${merge.pr ? `#${merge.pr} ` : ""}${entry.title}`,
    );
    tree(["add", "--all", "docs/release-notes"]);
    tree(["add", NOTES_FILE]);
    tree([
      "commit",
      "--quiet",
      "-m",
      `Release notes for ${date}\n\n${titles.join("\n")}`,
    ]);
    tree(["push", "--quiet", "-u", "origin", branch]);
    const url = gh([
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      branch,
      "--title",
      `Release notes for ${date}`,
      "--label",
      SKIP_LABEL,
      "--body",
      `\`pnpm release-notes\` joined ${joined.length} unreleased note(s) into \`${NOTES_FILE}\`:\n\n${titles.join("\n")}\n\nIt merges by itself once \`ci\` passes (auto-merge).`,
    ]);
    gh(["pr", "merge", url, "--auto", "--merge"]);
    return { kind: "opened", url, count: joined.length };
  } finally {
    run(["worktree", "remove", "--force", dir]);
    rmSync(dir, { recursive: true, force: true });
    // The branch lives on origin (or wasn't needed); none is left in the caller's repo.
    run(["branch", "-D", branch]);
  }
}
