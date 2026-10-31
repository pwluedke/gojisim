/**
 * The post-deploy smoke check's two steps around the Playwright run (#92), for
 * `.github/workflows/smoke.yml`. Pure helpers here; `smokeMain.ts` runs them.
 *
 * - wait: polls the live `/healthz` until it reports the pushed commit (Railway has deployed it).
 * - report: posts the result to Slack. A pass is one line in #gojisim-release-notes
 *   (`SLACK_RELEASE_WEBHOOK`); a failure goes to #gojisim-dev (`SLACK_DEV_WEBHOOK`, or the
 *   release-notes channel without it), naming the failed step, with the rollback command.
 *
 * Public repo: messages and log lines carry the step's name and the commit only, never an error
 * text (it could quote the page), the password or a webhook address.
 */

/** Whether `/healthz`'s answer names `commit` (the full SHA, or the start of it). */
export function reportsCommit(body: unknown, commit: string): boolean {
  if (typeof body !== "object" || body === null) return false;
  const deployed = (body as Record<string, unknown>)["commit"];
  return (
    typeof deployed === "string" &&
    deployed.length >= 7 &&
    commit.length >= 7 &&
    (deployed.startsWith(commit) || commit.startsWith(deployed))
  );
}

interface JsonStep {
  title: string;
  error?: unknown;
  steps?: JsonStep[];
}
interface JsonResult {
  status: string;
  steps?: JsonStep[];
}
interface JsonSuite {
  specs?: { tests?: { results?: JsonResult[] }[] }[];
  suites?: JsonSuite[];
}

/**
 * The smoke spec's failed `test.step` (its title) from Playwright's JSON report, in the last
 * attempt; "the check" when the failure was outside a step, `null` when it passed.
 */
export function failedStep(report: unknown): string | null {
  const results: JsonResult[] = [];
  const walk = (suite: JsonSuite) => {
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests ?? []) {
        const last = t.results?.at(-1);
        if (last) results.push(last);
      }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of (report as { suites?: JsonSuite[] } | null)?.suites ?? [])
    walk(s);
  if (results.length === 0) return "the check (no results)";
  const failed = results.find(
    (r) => r.status !== "passed" && r.status !== "skipped",
  );
  if (!failed) return null;
  const step = (failed.steps ?? []).find((s) => s.error !== undefined);
  return step ? step.title : "the check";
}

/** The pass line for #gojisim-release-notes. */
export const passMessage = (commit: string, url: string) =>
  `:white_check_mark: Smoke check passed on ${url} at \`${commit.slice(0, 7)}\`: login, a game against Easy, a turn each, and the upload.`;

/** The failure message for #gojisim-dev: the step, the commit, the run and the rollback. */
export function failMessage(
  step: string,
  commit: string,
  url: string,
  runUrl: string,
): string {
  return [
    `:rotating_light: *Smoke check failed* on ${url} at \`${commit.slice(0, 7)}\`: *${step}*.`,
    `Run (screenshot in its artifact): ${runUrl}`,
    "To go back to the previous release: `pnpm rollback` on Paul's Mac (it asks before pushing; docs/deploy.md).",
  ].join("\n");
}

/** Where a failure goes: #gojisim-dev's webhook, or the release-notes one without it. */
export function failureWebhook(
  env: Record<string, string | undefined>,
): string | undefined {
  return (
    env["SLACK_DEV_WEBHOOK"]?.trim() ||
    env["SLACK_RELEASE_WEBHOOK"]?.trim() ||
    undefined
  );
}
