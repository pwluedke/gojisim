import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { postRelease } from "./announce";
import {
  newestArchivedPr,
  nextTag,
  prFromSubject,
  prsInLog,
  type PullRequest,
  releaseBody,
} from "./release";

/**
 * `pnpm release-notes [--dry-run] [--since-pr N] [--ref REF]` (#89): the GitHub Release for a push
 * to `release`. The release workflow runs it; `--dry-run` prints the tag and text instead (needs
 * `gh` signed in). The release covers the PRs merged into main after the previous `release-*` tag
 * (before the first one: after the newest PR in `docs/release-notes.md`, the archive), or after
 * PR N with `--since-pr`. After the release, it posts it to Slack and Discord when their webhook
 * secrets are set (#134, `announce.ts`).
 */
const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "since-pr": { type: "string" },
    ref: { type: "string", default: "HEAD" },
  },
});
const root = process.env["INIT_CWD"] ?? process.cwd();
const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();
const git = (...args: string[]) => run("git", args);

/** The main commit that merged PR `n`, from the subjects on `ref`'s first-parent history. */
function mergeCommitOf(n: number): string {
  for (const line of git(
    "log",
    "--first-parent",
    "--format=%H%x09%s",
    values.ref,
  ).split("\n")) {
    const [sha = "", ...subject] = line.split("\t");
    if (prFromSubject(subject.join("\t")) === n) return sha;
  }
  throw new Error(`PR #${n} isn't merged into ${values.ref}`);
}

const tags = git(
  "for-each-ref",
  "--sort=-creatordate",
  "--format=%(refname:short)",
  "refs/tags/release-*",
)
  .split("\n")
  .filter(Boolean);
let base: string;
let from: string;
if (values["since-pr"]) {
  base = mergeCommitOf(Number(values["since-pr"]));
  from = `after #${values["since-pr"]}`;
} else if (tags[0]) {
  base = tags[0];
  from = `since ${tags[0]}`;
} else {
  const archived = newestArchivedPr(
    readFileSync(join(root, "docs/release-notes.md"), "utf8"),
  );
  if (archived === null)
    throw new Error("No release tag and no PR in docs/release-notes.md");
  base = mergeCommitOf(archived);
  from = `after #${archived} (the archive's newest)`;
}
const numbers = prsInLog(
  git("log", "--first-parent", "--format=%H%x09%s", `${base}..${values.ref}`),
);
const prs: PullRequest[] = numbers.map((n) => {
  const pr = JSON.parse(
    run("gh", ["pr", "view", String(n), "--json", "number,title,body"]),
  ) as PullRequest;
  return { number: pr.number, title: pr.title, body: pr.body ?? "" };
});
// Paul's date (decision 568), whatever the runner's time zone.
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
}).format(new Date());
const tag = nextTag(date, tags);
const body = releaseBody(prs);
const title = `Release ${date}${tag.endsWith("-1") ? "" : ` (${tag.split("-").at(-1)})`}`;

if (prs.length === 0) {
  console.log(`No PRs merged ${from}: no release.`);
  process.exit(0);
}
if (values["dry-run"]) {
  console.log(`${tag}: ${title}, ${prs.length} PR(s) ${from}\n\n${body}`);
  process.exit(0);
}
const file = join(mkdtempSync(join(tmpdir(), "release-")), "notes.md");
writeFileSync(file, body);
const sha = git("rev-parse", values.ref);
// `gh release create` prints the release's address.
const url = run("gh", [
  "release",
  "create",
  tag,
  "--target",
  sha,
  "--title",
  title,
  "--notes-file",
  file,
]);
console.log(url);
// #134: Slack #gojisim-release-notes and the Discord server; a failed post only warns.
const posted = await postRelease({ title, url, notes: body }, process.env);
if (posted.length > 0) console.log(`Posted to ${posted.join(" and ")}.`);
