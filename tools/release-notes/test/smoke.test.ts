import { describe, expect, it } from "vitest";
import { type ReleaseTag, rollbackTarget } from "../src/rollback";
import {
  failedStep,
  failMessage,
  failureWebhook,
  passMessage,
  reportsCommit,
} from "../src/smoke";

const SHA = "0123456789abcdef0123456789abcdef01234567";

/** A Playwright JSON report with one test whose attempts have these step results. */
const report = (
  ...attempts: { status: string; steps: { title: string; error?: unknown }[] }[]
) => ({
  suites: [{ suites: [{ specs: [{ tests: [{ results: attempts }] }] }] }],
});

describe("post-deploy smoke check (#92)", () => {
  it("waits for /healthz to report the pushed commit (full SHA or a prefix of 7+)", () => {
    expect(reportsCommit({ status: "ok", commit: SHA }, SHA)).toBe(true);
    expect(reportsCommit({ status: "ok", commit: SHA.slice(0, 7) }, SHA)).toBe(
      true,
    );
    expect(reportsCommit({ status: "ok", commit: "fedcba9876" }, SHA)).toBe(
      false,
    );
    expect(reportsCommit({ status: "ok", commit: null }, SHA)).toBe(false);
    expect(reportsCommit({ status: "ok" }, SHA)).toBe(false);
    expect(reportsCommit({ status: "ok", commit: "0123" }, SHA)).toBe(false);
    expect(reportsCommit("ok", SHA)).toBe(false);
  });

  it("names the failed step from the last attempt; a pass after a retry is a pass", () => {
    const ok = { title: "Log in" };
    expect(failedStep(report({ status: "passed", steps: [ok] }))).toBeNull();
    expect(
      failedStep(
        report({
          status: "failed",
          steps: [ok, { title: "Card images load", error: { message: "x" } }],
        }),
      ),
    ).toBe("Card images load");
    expect(
      failedStep(
        report(
          { status: "failed", steps: [{ title: "Log in", error: {} }] },
          { status: "passed", steps: [ok] },
        ),
      ),
    ).toBeNull();
    expect(failedStep(report({ status: "timedOut", steps: [ok] }))).toBe(
      "the check",
    );
    expect(failedStep({ suites: [] })).toBe("the check (no results)");
  });

  it("the pass line and the failure message: step, commit, run and rollback, nothing else", () => {
    expect(passMessage(SHA, "https://gojisim.somanygames.app")).toBe(
      ":white_check_mark: Smoke check passed on https://gojisim.somanygames.app at `0123456`: login, a game against Easy, a turn each, and the upload.",
    );
    const fail = failMessage(
      "The bot answers",
      SHA,
      "https://gojisim.somanygames.app",
      "https://github.com/r/actions/runs/9",
    );
    expect(fail).toContain("*The bot answers*");
    expect(fail).toContain("`0123456`");
    expect(fail).toContain("https://github.com/r/actions/runs/9");
    expect(fail).toContain("`pnpm rollback`");
  });

  it("a failure goes to #gojisim-dev's webhook, or the release-notes one without it", () => {
    expect(
      failureWebhook({
        SLACK_DEV_WEBHOOK: "dev",
        SLACK_RELEASE_WEBHOOK: "rel",
      }),
    ).toBe("dev");
    expect(
      failureWebhook({ SLACK_DEV_WEBHOOK: " ", SLACK_RELEASE_WEBHOOK: "rel" }),
    ).toBe("rel");
    expect(failureWebhook({})).toBeUndefined();
  });
});

describe("pnpm rollback (#92)", () => {
  const tags: ReleaseTag[] = [
    { name: "release-2026-10-31-2", commit: "c3" },
    { name: "release-2026-10-31-1", commit: "c2" },
    { name: "release-2026-10-30-1", commit: "c1" },
  ];
  it("goes back to the tag before the live one", () => {
    expect(rollbackTarget(tags, "c3")?.name).toBe("release-2026-10-31-1");
    // Already rolled back once: one further back.
    expect(rollbackTarget(tags, "c2")?.name).toBe("release-2026-10-30-1");
    expect(rollbackTarget(tags, "c1")).toBeNull();
  });
  it("from an untagged commit (a push with no new PRs), the newest tag", () => {
    expect(rollbackTarget(tags, "c4")?.name).toBe("release-2026-10-31-2");
    expect(rollbackTarget([], "c4")).toBeNull();
  });
});
