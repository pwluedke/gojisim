import { appendFileSync, readFileSync } from "node:fs";
import { runPost } from "./post";

/**
 * `pnpm discord-post`: the Discord post workflow's run (`.github/workflows/discord-post.yml`).
 * Its inputs come from the environment: `DISCORD_BUGS_WEBHOOK`, `MESSAGE`, `REPLY_TO`,
 * `MENTIONS`, `EDIT_ID`, and (Paul, Nov 15) `CHANNEL_ID` with `DISCORD_BOT_TOKEN` to post through
 * the bot in any channel or thread. The message id goes to the run summary.
 *
 * The message text comes from the dispatch event's `message` input ($GITHUB_EVENT_PATH), not the
 * step's env, which Actions prints in the log (Monarch, Nov 15); `MESSAGE` is for a local run.
 */
const env = (name: string) => process.env[name]?.trim() ?? "";
const summaryFile = env("GITHUB_STEP_SUMMARY");

/** The workflow_dispatch input `name` from the event file, or the env var for a local run. */
function input(name: string, envName: string): string {
  const event = env("GITHUB_EVENT_PATH");
  if (event)
    try {
      const inputs = (
        JSON.parse(readFileSync(event, "utf8")) as {
          inputs?: Record<string, unknown>;
        }
      ).inputs;
      const value = inputs?.[name];
      if (typeof value === "string") return value;
    } catch {
      // Fall back to the env var.
    }
  return process.env[envName] ?? "";
}

runPost({
  webhook: env("DISCORD_BUGS_WEBHOOK"),
  channelId: env("CHANNEL_ID"),
  reactions: env("REACTIONS"),
  botToken: env("DISCORD_BOT_TOKEN"),
  // The text as typed (not trimmed).
  message: input("message", "MESSAGE"),
  replyTo: env("REPLY_TO"),
  mentions: env("MENTIONS"),
  editId: env("EDIT_ID"),
  summary: (line) => {
    if (summaryFile) appendFileSync(summaryFile, `${line}\n`);
  },
}).catch((err: unknown) => {
  console.log(
    `::error::${err instanceof Error ? err.message : "The post failed."}`,
  );
  process.exitCode = 1;
});
