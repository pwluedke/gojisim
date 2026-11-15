import { appendFileSync } from "node:fs";
import { runPost } from "./post";

/**
 * `pnpm discord-post`: the Discord post workflow's run (`.github/workflows/discord-post.yml`).
 * Its inputs come from the environment: `DISCORD_BUGS_WEBHOOK`, `MESSAGE`, `REPLY_TO`,
 * `MENTIONS`, `EDIT_ID`, and (Paul, Nov 15) `CHANNEL_ID` with `DISCORD_BOT_TOKEN` to post through
 * the bot in any channel or thread. The message id goes to the run summary.
 */
const env = (name: string) => process.env[name]?.trim() ?? "";
const summaryFile = env("GITHUB_STEP_SUMMARY");

runPost({
  webhook: env("DISCORD_BUGS_WEBHOOK"),
  channelId: env("CHANNEL_ID"),
  botToken: env("DISCORD_BOT_TOKEN"),
  // The text as typed (not trimmed).
  message: process.env["MESSAGE"] ?? "",
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
