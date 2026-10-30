/**
 * Release notes as one file per PR (#89): each PR adds `docs/release-notes/unreleased/<issue>-<slug>.md`
 * (its PR number isn't known yet), so open PRs never conflict on one shared file. At deploy,
 * `pnpm release-notes` joins them into `docs/release-notes.md` under `## #<PR> <title> (<date>)`,
 * newest first, with the PR number and the merge date read from git, and empties `unreleased/`.
 * Pure: `main.ts` and `check.ts` run git and touch files.
 */

export const UNRELEASED = "docs/release-notes/unreleased";
export const NOTES_FILE = "docs/release-notes.md";
/** Sections every entry has, in order (the format since M13b). */
export const SECTIONS = [
  "What changed",
  "Fixed",
  "Testing notes",
  "Known issues",
] as const;

export interface Entry {
  /** The file's path, e.g. `docs/release-notes/unreleased/89-release-notes-files.md`. */
  file: string;
  title: string;
  /** Everything after the title line, trimmed. */
  body: string;
}

/** An unreleased file: `# Title`, then the four `### ` sections. Errors name what's wrong. */
export function parseEntry(file: string, text: string): Entry {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const first = lines[0] ?? "";
  if (!first.startsWith("# ") || first.slice(2).trim() === "")
    throw new Error(`${file}: the first line must be "# <title>"`);
  const body = lines.slice(1).join("\n").trim();
  const found = [...body.matchAll(/^### (.+)$/gm)].map((m) =>
    (m[1] ?? "").trim(),
  );
  const missing = SECTIONS.filter((s) => !found.includes(s));
  if (missing.length > 0)
    throw new Error(
      `${file}: missing section(s) ${missing.map((s) => `"### ${s}"`).join(", ")}`,
    );
  if (/^#{1,2} /m.test(body))
    throw new Error(
      `${file}: only the first line is a "# " heading; sections use "### "`,
    );
  return { file, title: first.slice(2).trim(), body };
}

/** Where an entry's PR landed on main: its number and the merge commit's date and order. */
export interface Merge {
  pr: number | null;
  /** `YYYY-MM-DD`, the merge commit's date in the machine's time zone (Paul's, decision 568). */
  date: string;
  /** The merge commit's position on main's first-parent history: higher is newer. */
  order: number;
}

/** The PR number in a merge commit's subject: GitHub's merge or squash wording. */
export function prFromSubject(subject: string): number | null {
  const merge = /^Merge pull request #(\d+)\b/.exec(subject);
  if (merge) return Number(merge[1]);
  const squash = /\(#(\d+)\)\s*$/.exec(subject);
  return squash ? Number(squash[1]) : null;
}

/** A merged entry as its release-notes block. */
export function block(entry: Entry, merge: Merge): string {
  const number = merge.pr === null ? "" : `#${merge.pr} `;
  return `## ${number}${entry.title} (${merge.date})\n\n${entry.body}\n`;
}

/**
 * The release notes with the merged entries added on top (newest merge first), after the file's
 * opening paragraph and before its first `## ` entry.
 */
export function join(
  notes: string,
  merged: readonly { entry: Entry; merge: Merge }[],
): string {
  if (merged.length === 0) return notes;
  const blocks = [...merged]
    .sort((a, b) => b.merge.order - a.merge.order)
    .map(({ entry, merge }) => block(entry, merge))
    .join("\n");
  const at = notes.search(/^## /m);
  if (at < 0) return `${notes.trimEnd()}\n\n${blocks}`;
  return `${notes.slice(0, at)}${blocks}\n${notes.slice(at)}`;
}

/** One changed path in a PR, from `git diff --name-status`. */
export interface Change {
  status: string;
  path: string;
}

/** The label that excuses a PR from adding notes (docs-only or tools-only changes). */
export const SKIP_LABEL = "no-release-notes";

/**
 * The CI check (#89): a PR that changes code under `apps/` or `packages/` adds or edits a notes
 * file in `unreleased/`, unless it carries the `no-release-notes` label. `null` means it passes.
 */
export function checkPr(
  changes: readonly Change[],
  labels: readonly string[],
): string | null {
  if (labels.includes(SKIP_LABEL)) return null;
  const code = changes.filter(
    (c) => c.status !== "D" && /^(apps|packages)\//.test(c.path),
  );
  if (code.length === 0) return null;
  const notes = changes.filter(
    (c) =>
      (c.status.startsWith("A") || c.status.startsWith("M")) &&
      c.path.startsWith(`${UNRELEASED}/`) &&
      c.path.endsWith(".md") &&
      !c.path.endsWith("/README.md"),
  );
  if (notes.length > 0) return null;
  return `This PR changes ${code.length} file(s) under apps/ or packages/ (first: ${code[0]?.path}) but adds no release notes. Add ${UNRELEASED}/<issue>-<slug>.md (README in that folder), or label the PR "${SKIP_LABEL}" if testers see no change, then re-run this job.`;
}
