import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { git } from "../src/git";
import { publish } from "../src/publish";

const ENTRY =
  "# Notes files\n\n### What changed\n\n- New.\n\n### Fixed\n\n- Nothing.\n\n### Testing notes\n\n- Try it.\n\n### Known issues\n\n- None known.\n";
const NOTES =
  "# Release notes\n\nIntro.\n\n## #10 Older (2026-10-01)\n\n### What changed\n\n- Old.\n";

/** An origin with one merged notes file on main, and Paul's clone of it. */
function repos() {
  const base = mkdtempSync(join(tmpdir(), "publish-"));
  const sh = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" });
  const origin = join(base, "origin.git");
  sh(base, "init", "-q", "--bare", "-b", "main", origin);
  const clone = join(base, "clone");
  sh(base, "clone", "-q", origin, clone);
  sh(clone, "config", "user.email", "t@example.com");
  sh(clone, "config", "user.name", "T");
  mkdirSync(join(clone, "docs/release-notes/unreleased"), { recursive: true });
  writeFileSync(join(clone, "docs/release-notes.md"), NOTES);
  sh(clone, "add", ".");
  sh(clone, "commit", "-q", "-m", "start");
  sh(clone, "checkout", "-q", "-b", "feature");
  writeFileSync(
    join(clone, "docs/release-notes/unreleased/89-files.md"),
    ENTRY,
  );
  sh(clone, "add", ".");
  sh(clone, "commit", "-q", "-m", "notes");
  sh(clone, "checkout", "-q", "main");
  sh(
    clone,
    "merge",
    "-q",
    "--no-ff",
    "feature",
    "-m",
    "Merge pull request #121 from x/feature",
  );
  sh(clone, "push", "-q", "origin", "main");
  return { origin, clone, sh };
}

describe("pnpm release-notes publish (#89)", () => {
  it("joins in a temporary worktree, pushes a branch, opens a labeled PR with auto-merge, and leaves the checkout alone", () => {
    const { origin, clone, sh } = repos();
    const calls: string[][] = [];
    const gh = (args: string[]) => {
      calls.push(args);
      if (args[0] === "api") return "true";
      if (args[1] === "create") return "https://github.com/x/y/pull/122";
      return "";
    };
    const result = publish(clone, git(clone), gh, "2026-10-31", git);
    expect(result).toEqual({
      kind: "opened",
      url: "https://github.com/x/y/pull/122",
      count: 1,
    });
    // The branch on origin has the joined notes and no unreleased file.
    const notes = sh(
      origin,
      "show",
      "release-notes-2026-10-31:docs/release-notes.md",
    );
    expect(notes).toMatch(
      /## #121 Notes files \(\d{4}-\d{2}-\d{2}\)\n\n### What changed/,
    );
    expect(
      sh(
        origin,
        "ls-tree",
        "--name-only",
        "release-notes-2026-10-31",
        "docs/release-notes/unreleased/",
      ),
    ).toBe("");
    const create = calls.find((c) => c[1] === "create") ?? [];
    expect(create).toEqual(
      expect.arrayContaining([
        "--label",
        "no-release-notes",
        "--title",
        "Release notes for 2026-10-31",
      ]),
    );
    expect(calls.find((c) => c[1] === "merge")).toEqual([
      "pr",
      "merge",
      "https://github.com/x/y/pull/122",
      "--auto",
      "--merge",
    ]);
    // Paul's checkout and branch are unchanged, and the temporary worktree is gone.
    expect(sh(clone, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
    expect(sh(clone, "status", "--porcelain")).toBe("");
    expect(
      readFileSync(
        join(clone, "docs/release-notes/unreleased/89-files.md"),
        "utf8",
      ),
    ).toBe(ENTRY);
    expect(sh(clone, "worktree", "list").trim().split("\n")).toHaveLength(1);
    expect(sh(clone, "branch", "--list", "release-notes-*").trim()).toBe("");
    // A second run the same day uses its own branch name.
    const again = publish(clone, git(clone), gh, "2026-10-31", git);
    expect(again.kind).toBe("opened");
    expect(
      sh(origin, "branch", "--list", "release-notes-2026-10-31-2").trim(),
    ).toBe("release-notes-2026-10-31-2");
  });

  it("stops before changing anything when the repo doesn't allow auto-merge; with nothing merged it opens no PR", () => {
    const { origin, clone, sh } = repos();
    const calls: string[][] = [];
    const off = (args: string[]) => {
      calls.push(args);
      return args[0] === "api" ? "false" : "";
    };
    expect(publish(clone, git(clone), off, "2026-10-31", git)).toEqual({
      kind: "autoMergeOff",
    });
    expect(calls).toHaveLength(1);
    expect(sh(origin, "branch", "--list", "release-notes-*").trim()).toBe("");
    // Joined already (the files are gone from main): nothing to do, no PR.
    sh(clone, "rm", "-q", "docs/release-notes/unreleased/89-files.md");
    sh(clone, "commit", "-q", "-m", "joined");
    sh(clone, "push", "-q", "origin", "main");
    const on = (args: string[]) => (args[0] === "api" ? "true" : "");
    expect(publish(clone, git(clone), on, "2026-10-31", git)).toEqual({
      kind: "nothing",
    });
    expect(sh(clone, "worktree", "list").trim().split("\n")).toHaveLength(1);
    expect(sh(clone, "branch", "--list", "release-notes-*").trim()).toBe("");
  });
});
