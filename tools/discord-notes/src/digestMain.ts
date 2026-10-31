import { parseArgs } from "node:util";
import { discordClient } from "./discordApi";
import { runDigest } from "./digestRun";

/**
 * `pnpm discord-digest [--hours 24]` (#140): the daily GitHub Action's run. It reads the GojiSim
 * Discord server's COMMUNITY channels and their threads with Paul's bot (`DISCORD_BOT_TOKEN`,
 * `DISCORD_GUILD_ID`), and posts the last `hours` of messages to Slack #gojisim-discord-digest
 * (`SLACK_DIGEST_WEBHOOK`). Nothing new, nothing posted. The repo is public, so the log has counts
 * only: never message text, names, or the token or webhook.
 */

/** The workflow's entry: reads its settings from the environment. */
async function main() {
  const { values } = parseArgs({
    options: { hours: { type: "string", default: "24" } },
  });
  const hours = Number(values.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 14)
    throw new Error("--hours must be a number of hours from 1 to 336");
  const token = process.env["DISCORD_BOT_TOKEN"]?.trim();
  const guildId = process.env["DISCORD_GUILD_ID"]?.trim();
  const webhook = process.env["SLACK_DIGEST_WEBHOOK"]?.trim();
  const missing = [
    !token && "DISCORD_BOT_TOKEN",
    !guildId && "DISCORD_GUILD_ID",
    !webhook && "SLACK_DIGEST_WEBHOOK",
  ].filter(Boolean);
  if (missing.length > 0 || !token || !guildId || !webhook) {
    console.log(
      `::warning::${missing.join(", ")} not set: no digest (docs/discord.md).`,
    );
    return;
  }
  await runDigest({
    get: discordClient(token),
    guildId,
    hours,
    now: Date.now(),
    post: async (text) =>
      (
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            unfurl_links: false,
            unfurl_media: false,
          }),
        })
      ).status,
    log: (line) => console.log(line),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    // An error names a status and an API path of ids, never text or secrets.
    console.log(
      `::error::${err instanceof Error ? err.message : "digest failed"}`,
    );
    process.exitCode = 1;
  });
}
