import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  failedStep,
  failMessage,
  failureWebhook,
  passMessage,
  reportsCommit,
} from "./smoke";

/**
 * `pnpm smoke wait --url U --commit SHA [--minutes 15]` and
 * `pnpm smoke report --url U --commit SHA --results FILE [--deploy-timeout]` (#92): the smoke
 * check workflow's steps around Playwright (`smoke.ts`). The log has statuses and the commit only.
 */
const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    url: { type: "string" },
    commit: { type: "string" },
    minutes: { type: "string", default: "15" },
    results: { type: "string" },
    "deploy-timeout": { type: "boolean", default: false },
  },
});
const url = (values.url ?? "").replace(/\/$/, "");
const commit = values.commit ?? "";
if (!url || !commit) throw new Error("--url and --commit are required");

async function wait(): Promise<void> {
  const deadline = Date.now() + Number(values.minutes) * 60_000;
  for (let n = 1; ; n++) {
    let body: unknown = null;
    try {
      const res = await fetch(`${url}/healthz`, {
        signal: AbortSignal.timeout(10_000),
      });
      body = res.ok ? await res.json() : null;
    } catch {
      // Not up yet, or restarting.
    }
    if (reportsCommit(body, commit)) {
      console.log(`The site runs ${commit.slice(0, 7)} (check ${n}).`);
      return;
    }
    if (Date.now() > deadline) {
      console.log(
        `::error::The site didn't report ${commit.slice(0, 7)} within ${values.minutes} min.`,
      );
      process.exitCode = 1;
      return;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

async function post(
  webhook: string | undefined,
  text: string,
  channel: string,
) {
  if (!webhook) {
    console.log(
      `::warning::No webhook for ${channel}: the result isn't posted.`,
    );
    return;
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, unfurl_links: false }),
  }).catch(() => null);
  console.log(
    res?.ok
      ? `Posted to ${channel}.`
      : `::warning::The ${channel} post failed (${res?.status ?? "network"}).`,
  );
}

async function report(): Promise<void> {
  const runUrl = `${process.env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${process.env["GITHUB_REPOSITORY"] ?? "pwluedke/gojisim"}/actions/runs/${process.env["GITHUB_RUN_ID"] ?? ""}`;
  let step: string | null;
  if (values["deploy-timeout"])
    step = "Railway didn't deploy the pushed commit within 15 minutes";
  else {
    let json: unknown;
    try {
      // pnpm runs this in tools/release-notes; the path is from where `pnpm smoke` was typed.
      const file = resolve(
        process.env["INIT_CWD"] ?? ".",
        values.results ?? "",
      );
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      json = null;
    }
    step =
      json === null
        ? "the check (no report: Playwright didn't run)"
        : failedStep(json);
  }
  if (step === null) {
    console.log("Smoke check passed.");
    await post(
      process.env["SLACK_RELEASE_WEBHOOK"]?.trim(),
      passMessage(commit, url),
      "#gojisim-release-notes",
    );
    return;
  }
  console.log(`Smoke check failed at: ${step}.`);
  const dev = !!process.env["SLACK_DEV_WEBHOOK"]?.trim();
  await post(
    failureWebhook(process.env),
    failMessage(step, commit, url, runUrl),
    dev ? "#gojisim-dev" : "#gojisim-release-notes",
  );
  process.exitCode = 1;
}

if (command === "wait") await wait();
else if (command === "report") await report();
else throw new Error("pnpm smoke wait|report");
