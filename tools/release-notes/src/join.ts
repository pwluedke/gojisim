import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join as joinPath } from "node:path";
import { type Git, mergeOf } from "./git";
import {
  type Entry,
  join,
  type Merge,
  NOTES_FILE,
  parseEntry,
  UNRELEASED,
} from "./notes";

export interface JoinResult {
  joined: { entry: Entry; merge: Merge }[];
  /** Files in `unreleased/` not yet on `ref` (left as they are). */
  pending: string[];
}

/**
 * Joins the unreleased files that are on `ref` into `docs/release-notes.md` and removes them;
 * `write: false` only reports what it would do.
 */
export function joinUnreleased(
  root: string,
  run: Git,
  ref: string,
  write: boolean,
): JoinResult {
  const dir = joinPath(root, UNRELEASED);
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f !== "README.md")
        .sort()
    : [];
  const joined: JoinResult["joined"] = [];
  const pending: string[] = [];
  for (const name of files) {
    const file = `${UNRELEASED}/${name}`;
    const entry = parseEntry(file, readFileSync(joinPath(root, file), "utf8"));
    const merge = mergeOf(run, ref, file);
    if (merge) joined.push({ entry, merge });
    else pending.push(file);
  }
  if (write && joined.length > 0) {
    const notesPath = joinPath(root, NOTES_FILE);
    writeFileSync(notesPath, join(readFileSync(notesPath, "utf8"), joined));
    for (const { entry } of joined) rmSync(joinPath(root, entry.file));
  }
  return { joined, pending };
}
