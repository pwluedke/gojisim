import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { describe, expect, it } from "vitest";
import { git } from "../src/git";
import { joinUnreleased } from "../src/join";
import {
  block,
  checkPr,
  join,
  parseEntry,
  prFromSubject,
  SKIP_LABEL,
} from "../src/notes";

const entryText = (title: string) =>
  [
    `# ${title}`,
    "",
    "### What changed",
    "",
    "- Something new.",
    "",
    "### Fixed",
    "",
    "- Nothing.",
    "",
    "### Testing notes",
    "",
    "- Try it.",
    "",
    "### Known issues",
    "",
    "- None known.",
    "",
  ].join("\n");

const NOTES =
  "# Release notes\n\nIntro paragraph.\n\n## #10 Older (2026-10-01)\n\n### What changed\n\n- Old.\n";

describe("release notes (#89)", () => {
  it("parses an entry: a # title and the four ### sections; refuses anything else", () => {
    const e = parseEntry("u/1-a.md", entryText("Card sounds"));
    expect(e.title).toBe("Card sounds");
    expect(e.body.startsWith("### What changed")).toBe(true);
    expect(() => parseEntry("u/x.md", "no title")).toThrow(/first line/);
    expect(() => parseEntry("u/x.md", "# T\n\n### What changed\n")).toThrow(
      /"### Fixed"/,
    );
    expect(() => parseEntry("u/x.md", `${entryText("T")}\n## Extra\n`)).toThrow(
      /only the first line/,
    );
  });

  it("reads the PR number from a merge or squash subject", () => {
    expect(
      prFromSubject("Merge pull request #117 from pwluedke/bad-bot-pick"),
    ).toBe(117);
    expect(
      prFromSubject(
        "Fix: Frozen's start-phase replacement crash (#104) (#110)",
      ),
    ).toBe(110);
    expect(prFromSubject("a direct commit")).toBeNull();
  });

  it("joins newest merge first, after the intro and before the first entry", () => {
    const a = parseEntry("u/1-a.md", entryText("First merged"));
    const b = parseEntry("u/2-b.md", entryText("Second merged"));
    const out = join(NOTES, [
      { entry: a, merge: { pr: 11, date: "2026-10-30", order: 5 } },
      { entry: b, merge: { pr: 12, date: "2026-10-31", order: 6 } },
    ]);
    const headings = out.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual([
      "## #12 Second merged (2026-10-31)",
      "## #11 First merged (2026-10-30)",
      "## #10 Older (2026-10-01)",
    ]);
    expect(
      out.startsWith("# Release notes\n\nIntro paragraph.\n\n## #12"),
    ).toBe(true);
    expect(join(NOTES, [])).toBe(NOTES);
    expect(block(a, { pr: null, date: "2026-10-30", order: 1 })).toMatch(
      /^## First merged \(2026-10-30\)\n/,
    );
  });

  it("CI check: code under apps/ or packages/ needs a notes file, or the label", () => {
    const code = { status: "M", path: "apps/web/src/x.ts" };
    const note = { status: "A", path: "docs/release-notes/unreleased/89-x.md" };
    expect(checkPr([code], [])).toMatch(/adds no release notes/);
    expect(checkPr([code, note], [])).toBeNull();
    expect(checkPr([code], [SKIP_LABEL])).toBeNull();
    // Tools, docs and deleted code need nothing; the folder's README doesn't count as notes.
    expect(
      checkPr([{ status: "M", path: "tools/bots/src/x.ts" }], []),
    ).toBeNull();
    expect(checkPr([{ status: "D", path: "packages/x.ts" }], [])).toBeNull();
    expect(
      checkPr(
        [
          code,
          { status: "A", path: "docs/release-notes/unreleased/README.md" },
        ],
        [],
      ),
    ).toMatch(/adds no release notes/);
  });

  it("joins only what's merged, with the PR number and date from git, and empties unreleased/", () => {
    const root = mkdtempSync(joinPath(tmpdir(), "release-notes-"));
    const sh = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_COMMITTER_DATE: "2026-10-31T12:00:00",
          GIT_AUTHOR_DATE: "2026-10-31T12:00:00",
        },
      });
    sh("init", "-q", "-b", "main");
    sh("config", "user.email", "t@example.com");
    sh("config", "user.name", "T");
    mkdirSync(joinPath(root, "docs/release-notes/unreleased"), {
      recursive: true,
    });
    writeFileSync(joinPath(root, "docs/release-notes.md"), NOTES);
    sh("add", ".");
    sh("commit", "-q", "-m", "start");
    // A PR branch adds its notes file, merged with GitHub's merge commit wording.
    sh("checkout", "-q", "-b", "feature");
    writeFileSync(
      joinPath(root, "docs/release-notes/unreleased/89-files.md"),
      entryText("Notes files"),
    );
    sh("add", ".");
    sh("commit", "-q", "-m", "notes");
    sh("checkout", "-q", "main");
    sh(
      "merge",
      "-q",
      "--no-ff",
      "feature",
      "-m",
      "Merge pull request #121 from x/feature",
    );
    // A file only in the working tree isn't merged yet.
    writeFileSync(
      joinPath(root, "docs/release-notes/unreleased/90-later.md"),
      entryText("Later"),
    );
    const dry = joinUnreleased(root, git(root), "HEAD", false);
    expect(dry.joined.map((j) => j.merge)).toEqual([
      { pr: 121, date: "2026-10-31", order: 2 },
    ]);
    expect(dry.pending).toEqual(["docs/release-notes/unreleased/90-later.md"]);
    expect(readFileSync(joinPath(root, "docs/release-notes.md"), "utf8")).toBe(
      NOTES,
    );
    joinUnreleased(root, git(root), "HEAD", true);
    expect(
      readFileSync(joinPath(root, "docs/release-notes.md"), "utf8"),
    ).toContain("## #121 Notes files (2026-10-31)\n\n### What changed");
    expect(
      existsSync(joinPath(root, "docs/release-notes/unreleased/89-files.md")),
    ).toBe(false);
    expect(
      existsSync(joinPath(root, "docs/release-notes/unreleased/90-later.md")),
    ).toBe(true);
  });
});
