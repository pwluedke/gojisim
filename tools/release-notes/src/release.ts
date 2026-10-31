/**
 * GitHub Releases from PR descriptions (#89, Paul's design, Oct 30): when Paul pushes `release`,
 * a workflow makes a release whose text is the "## Release notes" section of every PR merged into
 * main since the previous release, newest first. No notes files and no manual step. Pure: `main.ts`
 * runs git and gh.
 */

export interface PullRequest {
  number: number;
  title: string;
  body: string;
}

/** The PR number in a main commit's subject: GitHub's merge or squash wording; else `null`. */
export function prFromSubject(subject: string): number | null {
  const merge = /^Merge pull request #(\d+)\b/.exec(subject);
  if (merge) return Number(merge[1]);
  const squash = /\(#(\d+)\)\s*$/.exec(subject);
  return squash ? Number(squash[1]) : null;
}

/**
 * The PRs in `git log --first-parent --format=%H%x09%s <base>..<ref>` output, newest first, once
 * each (a direct commit without a PR number is skipped).
 */
export function prsInLog(log: string): number[] {
  const seen = new Set<number>();
  for (const line of log.split("\n")) {
    const subject = line.split("\t").slice(1).join("\t");
    const pr = prFromSubject(subject);
    if (pr !== null) seen.add(pr);
  }
  return [...seen];
}

/**
 * A PR description's "## Release notes" section: the lines after that heading, up to the next
 * `## ` heading or the "Generated with Claude Code" footer, trimmed. `null` when it has none, or
 * the section is empty.
 */
export function notesSection(body: string): string | null {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^##\s+Release notes\s*$/i.test(l));
  if (start < 0) return null;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line) || line.startsWith("🤖 Generated with")) break;
    out.push(line);
  }
  const text = out.join("\n").trim();
  return text === "" ? null : text;
}

/** Headings inside a section go one level down, under the release's `### #<PR> <title>`. */
const demote = (text: string) => text.replace(/^(#{3,5}) /gm, "#$1 ");

/**
 * The release's text: each PR with a "Release notes" section under `### #<PR> <title>`, newest
 * first, then the PRs without one by title only.
 */
export function releaseBody(prs: readonly PullRequest[]): string {
  const withNotes: string[] = [];
  const without: string[] = [];
  for (const pr of prs) {
    const notes = notesSection(pr.body);
    if (notes)
      withNotes.push(`### #${pr.number} ${pr.title}\n\n${demote(notes)}`);
    else without.push(`- #${pr.number} ${pr.title}`);
  }
  const parts = [...withNotes];
  if (without.length > 0)
    parts.push(`### Also merged\n\n${without.join("\n")}`);
  return `${parts.join("\n\n")}\n`;
}

/** The next tag for `date` (`YYYY-MM-DD`): `release-<date>-1`, or one past that day's highest. */
export function nextTag(date: string, existing: readonly string[]): string {
  const prefix = `release-${date}-`;
  const taken = existing
    .filter((t) => t.startsWith(prefix))
    .map((t) => Number(t.slice(prefix.length)))
    .filter((n) => Number.isInteger(n));
  return `${prefix}${taken.length > 0 ? Math.max(...taken) + 1 : 1}`;
}

/**
 * The newest PR in the archive (`docs/release-notes.md`, kept up to the switch): before the first
 * release tag, releases start after it.
 */
export function newestArchivedPr(archive: string): number | null {
  const numbers = [...archive.matchAll(/^## #(\d+) /gm)].map((m) =>
    Number(m[1]),
  );
  return numbers.length > 0 ? Math.max(...numbers) : null;
}
