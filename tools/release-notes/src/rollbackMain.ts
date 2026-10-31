import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { type ReleaseTag, rollbackTarget } from "./rollback";

/**
 * `pnpm rollback` (#92, docs/deploy.md): fetches the tags, shows what `release` (live) is at and
 * the previous `release-*` tag, and after a "y" pushes that tag's commit to `release`, so Railway
 * deploys it. Going back isn't a fast-forward, so the push is forced, but only if `release` is
 * still at the commit shown (`--force-with-lease`). The next `git push origin main:release` goes
 * forward again as usual.
 */
const root = process.env["INIT_CWD"] ?? process.cwd();
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

git("fetch", "--quiet", "--tags", "origin", "release");
const current = git("rev-parse", "origin/release");
const tags: ReleaseTag[] = git(
  "for-each-ref",
  "--sort=-creatordate",
  "--format=%(refname:short) %(*objectname)%(objectname)",
  "refs/tags/release-*",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [name = "", ids = ""] = line.split(" ");
    // An annotated tag lists its commit first (%(*objectname)); a light one only its own id.
    return { name, commit: ids.slice(0, 40) };
  });
const target = rollbackTarget(tags, current);
const subject = (sha: string) => git("log", "-1", "--format=%h %s (%cr)", sha);
console.log(`Live now (release): ${subject(current)}`);
if (!target) {
  console.log("There's no earlier release-* tag to go back to.");
  process.exit(1);
}
console.log(`Go back to ${target.name}: ${subject(target.commit)}`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (
  await rl.question("Push it to release, so Railway deploys it? [y/N] ")
)
  .trim()
  .toLowerCase();
rl.close();
if (answer !== "y" && answer !== "yes") {
  console.log("Nothing pushed.");
  process.exit(0);
}
execFileSync(
  "git",
  [
    "push",
    `--force-with-lease=release:${current}`,
    "origin",
    `${target.commit}:refs/heads/release`,
  ],
  { cwd: root, stdio: "inherit" },
);
console.log(
  `Pushed ${target.name} to release. Railway deploys it in a few minutes, and the smoke check runs on it. To go forward again later: git push origin main:release.`,
);
