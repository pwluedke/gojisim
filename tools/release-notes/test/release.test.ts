import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  newestArchivedPr,
  nextTag,
  notesSection,
  prFromSubject,
  PRIVATE_LABEL,
  prsInLog,
  publicPrs,
  releaseBody,
} from "../src/release";

// Made-up PR descriptions in the shape GojiSim's PRs use.
const withNotes = (notes: string) =>
  [
    "Closes #99",
    "",
    "## Summary",
    "",
    "Card sounds.",
    "",
    "## Release notes",
    "",
    notes,
    "",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ].join("\n");

describe("GitHub Releases from PR descriptions (#89)", () => {
  it("takes the Release notes section up to the next ## heading or the footer", () => {
    expect(
      notesSection(withNotes("- New: card sounds.\n- Fixed: a crash.")),
    ).toBe("- New: card sounds.\n- Fixed: a crash.");
    expect(
      notesSection("## Release notes\n\n- One.\n\n## Tests\n\n- Many."),
    ).toBe("- One.");
    expect(notesSection("## Summary\n\nNo notes here.")).toBeNull();
    expect(
      notesSection("## Release notes\n\n🤖 Generated with [Claude Code](x)"),
    ).toBeNull();
    // The PR template's placeholder comment alone isn't notes (#90).
    const template = readFileSync(
      new URL("../../../.github/pull_request_template.md", import.meta.url),
      "utf8",
    );
    expect(template).toMatch(/^## Release notes$/m);
    expect(notesSection(template)).toBeNull();
    expect(notesSection(template.replace("<!--", "- Card sounds.\n<!--"))).toBe(
      "- Card sounds.",
    );
    // A pointer instead of notes still counts as the section's text.
    expect(notesSection("## Release notes\r\n\r\nIn the docs.\r\n")).toBe(
      "In the docs.",
    );
  });

  it("builds the release text newest first, sub-headings one level down, PRs without notes by title", () => {
    const body = releaseBody([
      {
        number: 117,
        title: "Bad Bot! picks a move (#106)",
        body: withNotes("- Changed: pick a move."),
      },
      { number: 116, title: "Dependabot bump", body: "Bumps a library." },
      {
        number: 115,
        title: "Discord notes (#84)",
        body: withNotes("### For the dev team\n\n- A tool."),
      },
    ]);
    expect(body).toBe(
      [
        "### #117 Bad Bot! picks a move (#106)",
        "",
        "- Changed: pick a move.",
        "",
        "### #115 Discord notes (#84)",
        "",
        "#### For the dev team",
        "",
        "- A tool.",
        "",
        "### Also merged",
        "",
        "- #116 Dependabot bump",
        "",
      ].join("\n"),
    );
  });

  it("reads the PRs from main's first-parent log, newest first, skipping direct commits", () => {
    const log = [
      "aaa\tMerge pull request #120 from pwluedke/railway-iac",
      "bbb\tFix: Frozen's crash (#104) (#110)",
      "ccc\ta direct commit",
      "ddd\tMerge pull request #120 from pwluedke/railway-iac",
    ].join("\n");
    expect(prsInLog(log)).toEqual([120, 110]);
    expect(prFromSubject("Merge pull request #7 from a/b")).toBe(7);
  });

  it("tags are release-<date>-<n>, counting that day's releases", () => {
    expect(nextTag("2026-10-31", [])).toBe("release-2026-10-31-1");
    expect(
      nextTag("2026-10-31", [
        "release-2026-10-31-1",
        "release-2026-10-31-2",
        "release-2026-10-30-5",
      ]),
    ).toBe("release-2026-10-31-3");
  });

  it("before the first tag, releases start after the archive's newest PR", () => {
    expect(
      newestArchivedPr(
        "# Release notes\n\n## #120 A (2026-10-30)\n\n## #118 B (2026-10-30)\n",
      ),
    ).toBe(120);
    expect(newestArchivedPr("# Release notes\n")).toBeNull();
  });
});

describe("private PRs stay out of the release notes (Paul, Nov 18)", () => {
  it("a PR labeled private-set is left out of the text, title and all; the others stay", () => {
    const prs = [
      {
        number: 12,
        title: "A secret thing",
        body: withNotes("Secret notes."),
        labels: [PRIVATE_LABEL],
      },
      {
        number: 11,
        title: "Card sounds",
        body: withNotes("Cards make a sound."),
        labels: ["bot"],
      },
      { number: 10, title: "No labels read", body: withNotes("Older.") },
    ];
    const shown = publicPrs(prs);
    expect(shown.map((p) => p.number)).toEqual([11, 10]);
    const body = releaseBody(shown);
    expect(body).toContain("Cards make a sound.");
    expect(body).not.toContain("secret");
    expect(body).not.toContain("Secret");
    expect(body).not.toContain("#12");
  });

  it("a release of private PRs only has none to show", () => {
    expect(
      publicPrs([{ number: 1, title: "x", body: "", labels: [PRIVATE_LABEL] }]),
    ).toEqual([]);
  });
});
