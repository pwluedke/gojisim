import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { discordClient } from "./discordApi";
import { runDigest } from "./digestRun";

/**
 * `pnpm discord-digest [--hours 3] [--overlap-minutes 10] [--seen file]` (#140, every 3 hours
 * since #148): the GitHub Action's run. `--seen` is a JSON list of the Discord message ids already
 * posted (the workflow keeps it in the Actions cache), so the overlap never posts twice. It reads the GojiSim
 * Discord server's COMMUNITY channels and their threads with Paul's bot (`DISCORD_BOT_TOKEN`,
 * `DISCORD_GUILD_ID`), and posts the last `hours` of messages to Slack #gojisim-discord-digest
 * (`SLACK_DIGEST_WEBHOOK`). Nothing new, nothing posted. The repo is public, so the log has counts
 * only: never message text, names, or the token or webhook.
 */

/** The workflow's entry: reads its settings from the environment. */
async function main() {
  const { values } = parseArgs({
    options: {
      hours: { type: "string", default: "3" },
      "overlap-minutes": { type: "string", default: "10" },
      seen: { type: "string" },
    },
  });
  const overlapMinutes = Number(values["overlap-minutes"]);
  if (
    !Number.isFinite(overlapMinutes) ||
    overlapMinutes < 0 ||
    overlapMinutes > 120
  )
    throw new Error("--overlap-minutes must be 0 to 120");
  // pnpm runs this in tools/discord-notes; the path is from where `pnpm discord-digest` was typed.
  const seenFile = values.seen
    ? resolve(process.env["INIT_CWD"] ?? ".", values.seen)
    : null;
  let seen = new Set<string>();
  if (seenFile && existsSync(seenFile))
    try {
      const ids = JSON.parse(readFileSync(seenFile, "utf8")) as unknown;
      if (Array.isArray(ids))
        seen = new Set(
          ids.filter((id): id is string => typeof id === "string"),
        );
    } catch {
      console.log(
        "::warning::The seen-ids file couldn't be read: starting fresh.",
      );
    }
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
    overlapMinutes,
    seen,
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
  if (seenFile) {
    writeFileSync(seenFile, `${JSON.stringify([...seen])}\n`);
    console.log(`${seen.size} posted ids kept for the next run.`);
  }
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
