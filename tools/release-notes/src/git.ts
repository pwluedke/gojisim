import { execFileSync } from "node:child_process";
import { type Merge, prFromSubject } from "./notes";

/** Runs git at the repo root and returns its trimmed output. */
export type Git = (args: string[]) => string;

export const git =
  (cwd: string): Git =>
  (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * Where `file` landed on `ref`: the oldest first-parent commit that touches it is the PR's merge
 * (or squash) commit. Its subject gives the PR number, its date the release-notes date, and its
 * first-parent position the merge order. `null` when the file isn't on `ref`.
 */
export function mergeOf(run: Git, ref: string, file: string): Merge | null {
  const lines = run([
    "log",
    "--first-parent",
    "--format=%H%x09%cd%x09%s",
    "--date=format-local:%Y-%m-%d",
    ref,
    "--",
    file,
  ])
    .split("\n")
    .filter((l) => l !== "");
  const oldest = lines.at(-1);
  if (!oldest) return null;
  const [sha = "", date = "", ...subject] = oldest.split("\t");
  const order = Number(run(["rev-list", "--first-parent", "--count", sha]));
  return { pr: prFromSubject(subject.join("\t")), date, order };
}
